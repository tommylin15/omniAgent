"""Regional, fail-closed release of the three existing omniAgent services."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request
from urllib.parse import quote

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
REGISTRY = f"{REGION}-docker.pkg.dev/{PROJECT}/omniagent"
REPOSITORY = f"projects/{PROJECT}/locations/{REGION}/connections/tommy-github/repositories/tommylin15-omniAgent"
SERVICES = {"chat": "omniagent-chat", "gateway": "omniagent-agent-gateway", "shared": "omniagent-shared-codex"}
DOCKERFILES = {"chat": "services/chat-api/Dockerfile", "gateway": "services/agent-gateway/Dockerfile", "shared": "services/shared-codex/Dockerfile"}
STATE = Path(".cicd-v2.json")
BUCKET = f"{PROJECT}-cloudbuild-regional"
PREFIX = "omniagent-cicd-v2/"


def changed_components(files):
    if files is None:
        return set(SERVICES)
    result = set()
    for name in files:
        if name in ("package.json", "package-lock.json", "tsconfig.json"):
            return set(SERVICES)
        if name.startswith(("services/chat-api/", "apps/agent_app/", "infra/postgres/migrations/")):
            result.add("chat")
        if name.startswith("services/agent-gateway/"):
            result.add("gateway")
            if name.rsplit("/", 1)[-1] in ("server.ts", "codex_bridge.ts", "mcp_host.ts", "agent_security.ts", "tsconfig.json"):
                result.add("shared")
            if name.endswith("agent_security.ts"):
                result.add("chat")
        if name.startswith("services/shared-codex/"):
            result.add("shared")
    return result


def require_budget(usage, max_attempts=2, max_provider_calls=5):
    if usage.get("attempts", 0) >= max_attempts or usage.get("provider_calls", 0) >= max_provider_calls:
        raise RuntimeError("COST_LIMIT: release attempts/provider calls exhausted")


def require_current(sha, current):
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or sha != current:
        raise RuntimeError("STALE_SHA: main changed; this build cannot mutate runtime")


def is_build_turn(build_id, active):
    return bool(active) and min(active, key=lambda b: (b["createTime"], b["id"]))["id"] == build_id


def cleanup_candidates(images, protected):
    owned = {f"{REGISTRY}/{name}" for name in SERVICES.values()}
    result = []
    for row in images:
        image = row["package"] + "@" + row["version"] if row.get("package") else row["version"]
        if image.split("@")[0] in owned and image not in protected and all(re.fullmatch(r"[0-9a-f]{40}", tag) for tag in row.get("tags", [])):
            result.append(image)
    return sorted(set(result))


def candidate_route(service, tag):
    route = next((r for r in service["status"].get("traffic", []) if r.get("tag") == tag), None)
    if not route or not route.get("revisionName") or not route.get("url") or route.get("percent", 0) != 0:
        raise RuntimeError("candidate must exist with zero traffic")
    return route


def historical_sha(image, rows):
    tags = {tag for row in rows if row.get("package", "") + "@" + row["version"] == image
        for tag in row.get("tags", []) if re.fullmatch(r"[0-9a-f]{40}", tag)}
    return next(iter(tags)) if len(tags) == 1 else None


def require_digest(expected, actual):
    if expected != actual:
        raise RuntimeError("runtime digest does not match built image")


def command(args):
    # Never echo command arguments: some subprocesses handle temporary tokens.
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"{args[0]} {args[1]} failed (exit {result.returncode}): " + result.stderr[-1500:].strip())
    return result.stdout.strip()


def gcloud(*args):
    return command(["gcloud", *args, f"--project={PROJECT}", "--quiet"])


def cloud_json(*args):
    return json.loads(gcloud(*args, "--format=json"))


def save(state):
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    # State includes references and test outcomes only, never credentials/payloads.
    print(json.dumps(state, sort_keys=True), flush=True)


def object_url(name):
    return f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/" + quote(PREFIX + name, safe="")


def store_object(name, data, generation=None):
    token = gcloud("auth", "print-access-token")
    url = f"https://storage.googleapis.com/upload/storage/v1/b/{BUCKET}/o?uploadType=media&name=" + quote(PREFIX + name, safe="")
    if generation is not None:
        url += "&ifGenerationMatch=" + str(generation)
    return api(url, token, data)


def read_object(name):
    try:
        return api(object_url(name) + "?alt=media", gcloud("auth", "print-access-token"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def unlock(state):
    for name, generation in state.get("locks", {}).items():
        token = gcloud("auth", "print-access-token")
        req = urllib.request.Request(object_url("locks/" + name + ".json") + "?ifGenerationMatch=" + generation,
            method="DELETE", headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=30):
            pass
    state["locks"] = {}
    save(state)


def lock(state, name):
    path = "locks/" + name + ".json"
    try:
        meta = store_object(path, {"build_id": state["build_id"], "sha": state["sha"]}, generation=0)
    except urllib.error.HTTPError as exc:
        if exc.code != 412:
            raise
        meta = api(object_url(path), gcloud("auth", "print-access-token"))
        owner = api(object_url(path) + "?alt=media&generation=" + meta["generation"], gcloud("auth", "print-access-token"))
        previous = cloud_json("builds", "describe", owner["build_id"], f"--region={REGION}")
        if previous["status"] not in ("SUCCESS", "FAILURE", "CANCELLED", "TIMEOUT", "EXPIRED", "INTERNAL_ERROR"):
            raise RuntimeError("LOCK_BUSY: " + name)
        req = urllib.request.Request(object_url(path) + "?ifGenerationMatch=" + meta["generation"],
            method="DELETE", headers={"Authorization": "Bearer " + gcloud("auth", "print-access-token")})
        with urllib.request.urlopen(req, timeout=30):
            pass
        meta = store_object(path, {"build_id": state["build_id"], "sha": state["sha"]}, generation=0)
    state.setdefault("locks", {})[name] = meta["generation"]
    save(state)


def api(url, token, body=None):
    request = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.load(response)


def github_token():
    token = gcloud("auth", "print-access-token")
    data = api(f"https://cloudbuild.googleapis.com/v2/{REPOSITORY}:accessReadToken", token, {})
    return data["token"]


def main_sha(token):
    return api("https://api.github.com/repos/tommylin15/omniAgent/git/ref/heads/main", token)["object"]["sha"]


def fresh(state):
    require_current(state["sha"], main_sha(github_token()))


def service(name):
    return cloud_json("run", "services", "describe", name, f"--region={REGION}")


def prepare(sha, build_id, mode, release_sha):
    token = github_token()
    require_current(sha, sha)
    if mode != "ci":
        require_current(sha, release_sha)
        require_current(sha, main_sha(token))
    current = cloud_json("builds", "describe", build_id, f"--region={REGION}")
    trigger = current["buildTriggerId"]
    config = cloud_json("builds", "triggers", "describe", trigger, f"--region={REGION}")
    if mode != "ci" and config.get("repositoryEventConfig", {}).get("push"):
        raise RuntimeError("push CI trigger cannot deploy")
    if mode == "ci":
        commit = api(f"https://api.github.com/repos/tommylin15/omniAgent/commits/{sha}", token)
        files = commit.get("files", [])
        state = {"sha": sha, "build_id": build_id, "trigger_id": trigger, "mode": mode,
            "components": sorted(changed_components([f["filename"] for f in files] if len(files) < 300 else None)),
            "services": {}, "gates": {}, "released": False}
        save(state)
        return
    if mode == "canonical":
        ci = read_object("ci/" + sha + ".json")
        if not ci or ci.get("sha") != sha or ci.get("status") != "PASS":
            raise RuntimeError("READY_BLOCKED: exact SHA Cloud Build CI not PASS")
        if cloud_json("builds", "describe", ci["build_id"], f"--region={REGION}")["status"] != "SUCCESS":
            raise RuntimeError("READY_BLOCKED: recorded CI build not SUCCESS")
    deadline = time.monotonic() + 1800
    while True:
        active = cloud_json("builds", "list", f"--region={REGION}",
            f"--filter=buildTriggerId={trigger} AND (status=WORKING OR status=QUEUED)", "--limit=1000")
        if is_build_turn(build_id, active):
            break
        if time.monotonic() > deadline:
            raise RuntimeError("release serialization timed out")
        time.sleep(15)
        if mode != "ci":
            require_current(sha, main_sha(token))
    snapshots = {key: service(name) for key, name in SERVICES.items()}
    journal = read_object("releases/current.json") or {}
    baselines = {}
    components = set()
    for key, snapshot in snapshots.items():
        released = journal.get(key)
        baseline = released.get("sha") if released else None
        if not baseline:
            active = max(snapshot["status"]["traffic"], key=lambda r: r.get("percent", 0))["revisionName"]
            revision = cloud_json("run", "revisions", "describe", active, f"--region={REGION}")
            image = revision["spec"]["containers"][0]["image"]
            tag = image.rsplit(":", 1)[-1] if "@" not in image else ""
            baseline = tag if re.fullmatch(r"[0-9a-f]{40}", tag) else None
            if not baseline and image.startswith(REGISTRY + "/") and "@sha256:" in image:
                rows = cloud_json("artifacts", "docker", "images", "list", image.split("@")[0],
                    "--include-tags", "--limit=10000")
                if len(rows) < 10000:
                    baseline = historical_sha(image, rows)
        baselines[key] = baseline
        files = None
        if baseline:
            comparison = api(f"https://api.github.com/repos/tommylin15/omniAgent/compare/{baseline}...{sha}", token)
            rows = comparison.get("files", [])
            if len(rows) < 300 and comparison.get("status") in ("ahead", "identical"):
                files = [r["filename"] for r in rows] + [r["previous_filename"] for r in rows if "previous_filename" in r]
        if key in changed_components(files):
            components.add(key)
    state = {"sha": sha, "build_id": build_id, "trigger_id": trigger, "baselines": baselines, "mode": mode,
        "components": sorted(components), "services": {}, "gates": {}, "released": False}
    for key, snapshot in snapshots.items():
        container = snapshot["spec"]["template"]["spec"]["containers"][0]
        env = {e["name"]: e["value"] for e in container.get("env", []) if "value" in e}
        state["services"][key] = {"url": snapshot["status"]["url"], "previous_traffic": snapshot["status"]["traffic"],
            "runtime_sa": snapshot["spec"]["template"]["spec"]["serviceAccountName"],
            "previous_revision": max(snapshot["status"]["traffic"], key=lambda r: r.get("percent", 0))["revisionName"]}
        if key == "chat":
            client_id = env.get("OMNIAGENT_GOOGLE_CLIENT_ID", "")
            if not client_id:
                raise RuntimeError("missing existing Google Web client ID")
            state["google_client_id"] = client_id
    if mode == "canonical" and "gateway" in components:
        gcloud("secrets", "versions", "describe", "latest", "--secret=omniagent-provider-bundle")
    save(state)
    if mode != "ci" and components:
        lock(state, "release")
        try:
            usage = read_object("usage/" + sha + ".json") or {"attempts": 0, "provider_calls": 0}
            require_budget(usage)
            if "shared" in components:
                lock(state, "shared-codex")
            usage["attempts"] += 1
            store_object("usage/" + sha + ".json", usage)
            state["usage"] = usage
            save(state)
        except Exception:
            unlock(state)
            raise


def record_ci(state):
    state["gates"]["source_ci"] = "PASS"
    store_object("ci/" + state["sha"] + ".json", {"sha": state["sha"], "build_id": state["build_id"], "status": "PASS"})
    save(state)


def build_images(state):
    if not state["components"]:
        state["gates"]["no_runtime_change"] = "PASS"
        save(state)
        return
    fresh(state)
    gcloud("auth", "configure-docker", f"{REGION}-docker.pkg.dev")
    for key in state["components"]:
        image = f"{REGISTRY}/{SERVICES[key]}:{state['sha']}"
        rows = cloud_json("artifacts", "docker", "images", "list", image.split(":")[0], "--include-tags", "--limit=10000")
        if len(rows) >= 10000:
            raise RuntimeError("image inventory may be truncated")
        digest = next((row["version"] for row in rows if state["sha"] in row.get("tags", [])), "")
        if digest:
            state["services"][key]["image"] = image.split(":")[0] + "@" + digest
            save(state)
            continue
        args = ["docker", "build", "-f", DOCKERFILES[key], "-t", image]
        if key == "chat":
            args += ["--build-arg=OMNIAGENT_GOOGLE_CLIENT_ID=" + state["google_client_id"]]
        command([*args, "."])
        if key in ("gateway", "shared"):
            version = command(["docker", "run", "--rm", image,
                "/app/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex", "--version"])
            if "0.153.4" not in version:
                raise RuntimeError("Codex package version drift")
        command(["docker", "push", image])
        digest = gcloud("artifacts", "docker", "images", "describe", image, "--format=value(image_summary.digest)")
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
            raise RuntimeError("immutable image digest missing")
        state["services"][key]["image"] = image.split(":")[0] + "@" + digest
        save(state)


def deploy(state):
    fresh(state)
    for key in state["components"]:
        row = state["services"][key]
        tag = "v2-" + state["sha"]
        revision = SERVICES[key] + "-v2-" + state["sha"][:32]
        existing = cloud_json("run", "revisions", "list", "--service=" + SERVICES[key], f"--region={REGION}", "--limit=1000")
        if any(r["metadata"]["name"] == revision for r in existing):
            route = candidate_route(service(SERVICES[key]), tag)
            if route["revisionName"] != revision:
                raise RuntimeError("same-SHA candidate tag drift")
            runtime = cloud_json("run", "revisions", "describe", revision, f"--region={REGION}")
            require_digest(row["image"], runtime["status"]["imageDigest"])
            row.update(candidate_url=route["url"], candidate_revision=revision, candidate_tag=tag)
            save(state)
            continue
        args = ["run", "deploy", SERVICES[key], f"--region={REGION}", "--image=" + row["image"],
            "--no-traffic", "--tag=" + tag, "--revision-suffix=" + revision[len(SERVICES[key]) + 1:],
            "--update-labels=cicd-v2-candidate-sha=" + state["sha"]]
        if key == "gateway":
            try:
                gcloud("secrets", "describe", "omniagent-provider-bundle")
            except RuntimeError:
                state["gates"]["gateway"] = "BLOCKED_PROVIDER_BUNDLE: approved omniagent-provider-bundle missing or inaccessible"
                save(state)
                continue
            args += ["--update-secrets=OMNIAGENT_PROVIDER_BUNDLE=omniagent-provider-bundle:latest"]
        gcloud(*args)
        after = service(SERVICES[key])
        route = candidate_route(after, tag)
        runtime = cloud_json("run", "revisions", "describe", route["revisionName"], f"--region={REGION}")
        require_digest(row["image"], runtime["status"]["imageDigest"])
        if runtime["spec"]["serviceAccountName"] != row["runtime_sa"]:
            raise RuntimeError("candidate runtime identity changed")
        row.update(candidate_url=route["url"], candidate_revision=route["revisionName"], candidate_tag=tag)
        save(state)


def traffic_percent(rows):
    return {r["revisionName"]: r["percent"] for r in rows if r.get("percent", 0)}


def recover(state, promoted):
    failures = []
    for key in reversed(promoted):
        try:
            previous = traffic_percent(state["services"][key]["previous_traffic"])
            gcloud("run", "services", "update-traffic", SERVICES[key], f"--region={REGION}",
                "--to-revisions=" + ",".join(f"{rev}={percent}" for rev, percent in previous.items()))
            if traffic_percent(service(SERVICES[key])["status"]["traffic"]) != previous:
                raise RuntimeError("recovery traffic mismatch")
        except RuntimeError:
            failures.append(key)
    state["recovery"] = "FAIL:" + ",".join(failures) if failures else "PASS"
    save(state)


def release(state, mode):
    if not state["components"]:
        state["release_result"] = "NO_RUNTIME_CHANGE"
        save(state)
        return
    required = [*state["components"], "recovery"]
    if "chat" in state["components"]:
        required += ["flutter", "browser_oauth", "chat_gateway_integration"]
    missing = [name for name in required if state["gates"].get(name) != "PASS"]
    if missing:
        raise RuntimeError("LIVE_GATES_BLOCKED: " + ",".join(missing))
    if mode != "canonical":
        state["gates"]["promotion"] = "SHADOW_ONLY"
        save(state)
        return
    fresh(state)
    promoted = []
    try:
        journal = read_object("releases/current.json") or {}
        for key in state["components"]:
            fresh(state)
            row = state["services"][key]
            now = service(SERVICES[key])
            if traffic_percent(now["status"]["traffic"]) != traffic_percent(row["previous_traffic"]):
                raise RuntimeError("traffic drift: manual repair or concurrent deploy; release refused")
            promoted.append(key)
            gcloud("run", "services", "update-traffic", SERVICES[key], f"--region={REGION}",
                "--to-revisions=" + row["candidate_revision"] + "=100")
            after = service(SERVICES[key])
            if traffic_percent(after["status"]["traffic"]) != {row["candidate_revision"]: 100}:
                raise RuntimeError("release traffic readback failed")
            runtime = cloud_json("run", "revisions", "describe", row["candidate_revision"], f"--region={REGION}")
            require_digest(row["image"], runtime["status"]["imageDigest"])
        for key in state["components"]:
            after = service(SERVICES[key])
            row = state["services"][key]
            expected = {row["candidate_revision"]: 100} if key in state["components"] else traffic_percent(row["previous_traffic"])
            if traffic_percent(after["status"]["traffic"]) != expected:
                raise RuntimeError("final runtime traffic drift")
            runtime = cloud_json("run", "revisions", "describe", row["candidate_revision"], f"--region={REGION}")
            require_digest(row["image"], runtime["status"]["imageDigest"])
            journal[key] = {"sha": state["sha"], "build_id": state["build_id"],
                "image": row["image"], "revision": row["candidate_revision"], "traffic": 100}
        store_object("releases/current.json", journal)
        state["released"] = True
        save(state)
    except Exception:
        recover(state, promoted)
        raise


def referenced_images(value):
    if isinstance(value, dict):
        if isinstance(value.get("image"), str):
            yield value["image"]
        for child in value.values():
            yield from referenced_images(child)
    elif isinstance(value, list):
        for child in value:
            yield from referenced_images(child)


def cleanup(state, apply=False):
    protected = {r["image"] for r in state["services"].values() if r.get("image")}
    # Keep *all* extant revisions, including zero-traffic rollback revisions.
    all_services = cloud_json("run", "services", "list", "--platform=managed", "--limit=1000")
    if len(all_services) >= 1000:
        raise RuntimeError("cleanup refused: service inventory may be truncated")
    for runtime_service in all_services:
        name = runtime_service["metadata"]["name"]
        region = runtime_service["metadata"]["labels"]["cloud.googleapis.com/location"]
        revisions = cloud_json("run", "revisions", "list", "--service=" + name, "--region=" + region, "--limit=1000")
        if len(revisions) >= 1000:
            raise RuntimeError("cleanup refused: revision inventory may be truncated")
        for revision in revisions:
            digest = revision.get("status", {}).get("imageDigest")
            if not digest:
                raise RuntimeError("cleanup refused: revision digest unavailable")
            protected.add(digest)
    jobs = cloud_json("run", "jobs", "list", "--limit=1000")
    if len(jobs) >= 1000:
        raise RuntimeError("cleanup refused: job inventory may be truncated")
    for job in jobs:
        region = job["metadata"]["labels"]["cloud.googleapis.com/location"]
        executions = cloud_json("run", "jobs", "executions", "list", "--job=" + job["metadata"]["name"],
            "--region=" + region, "--limit=1000")
        if len(executions) >= 1000:
            raise RuntimeError("cleanup refused: execution inventory may be truncated")
        if any(image.startswith(REGISTRY + "/") and "@sha256:" not in image for image in referenced_images(executions)):
            raise RuntimeError("cleanup refused: retained execution uses unresolved image tag")
        for image in referenced_images([job, executions]):
            if image.startswith(REGISTRY + "/"):
                if "@sha256:" not in image:
                    digest = gcloud("artifacts", "docker", "images", "describe", image, "--format=value(image_summary.digest)")
                    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
                        raise RuntimeError("cleanup refused: job/execution digest unavailable")
                    image = image.rsplit(":", 1)[0] + "@" + digest
                protected.add(image)
    images = cloud_json("artifacts", "docker", "images", "list", REGISTRY, "--include-tags", "--limit=10000")
    plan = cleanup_candidates(images, protected)
    state["cleanup_dry_run"] = plan
    save(state)
    if apply:
        if not state["released"]:
            raise RuntimeError("cleanup refused before accepted release")
        fresh(state)
        for image in plan:
            # Re-read references/tags for each deletion; manual repairs may race CI.
            cleanup(state)
            if image not in state["cleanup_dry_run"]:
                raise RuntimeError("cleanup plan changed; deletion refused")
            gcloud("artifacts", "docker", "images", "delete", image, "--delete-tags")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("prepare", "build", "deploy", "release", "cleanup", "record-ci"))
    parser.add_argument("--sha")
    parser.add_argument("--build-id")
    parser.add_argument("--release-sha", default="")
    parser.add_argument("--mode", choices=("ci", "shadow", "canonical"), default="shadow")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.action == "prepare":
        prepare(args.sha, args.build_id, args.mode, args.release_sha)
    else:
        state = json.loads(STATE.read_text(encoding="utf-8"))
        try:
            if args.action == "record-ci": record_ci(state)
            elif args.action == "build": build_images(state)
            elif args.action == "deploy": deploy(state)
            elif args.action == "release": release(state, args.mode)
            else: cleanup(state, args.apply)
        except Exception as exc:
            state["error"] = str(exc)
            save(state)
            raise SystemExit(str(exc))
        finally:
            if args.action == "release":
                store_object("evidence/" + state["build_id"] + ".json", state)
                unlock(state)
