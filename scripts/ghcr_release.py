"""Protected three-service GHCR rollback rehearsal and promotion; no resource deletion."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from update_preview import PROJECT, REGION, check_source

SERVICES = ("omniagent-agent-gateway", "omniagent-shared-codex", "omniagent-chat")
GATES = ("ci", "provider_reply", "durable_replay", "approval_cancel", "mcp", "process_loss", "browser_a_b_a", "preview_recovery")


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError("command_failed")
    return result.stdout


def cloud(*args):
    return command("gcloud", *args, "--project=" + PROJECT, "--region=" + REGION)


def snapshot(service):
    return json.loads(cloud("run", "services", "describe", service, "--format=json"))


def active(document):
    return {row["revisionName"]: row["percent"] for row in document["status"]["traffic"] if row.get("percent", 0)}


def tags(document):
    return {row["tag"]: (row["revisionName"], row.get("url")) for row in document["status"]["traffic"] if row.get("tag")}


def protected(before, after):
    if before["spec"]["template"] != after["spec"]["template"] or tags(before) != tags(after):
        raise RuntimeError("protected_state_drift")


def validate(manifest, acceptance):
    sha = manifest.get("source_sha", "")
    if not re.fullmatch(r"[a-f0-9]{40}", sha) or acceptance.get("source_sha") != sha:
        raise ValueError("acceptance_source_mismatch")
    if set(manifest.get("services", {})) != set(SERVICES) or set(acceptance.get("gates", {})) != set(GATES):
        raise ValueError("incomplete_release")
    for gate in GATES:
        evidence = acceptance["gates"][gate]
        if evidence.get("status") != "PASS" or not re.fullmatch(r"https://github.com/tommylin15/omniAgent/actions/runs/[0-9]+", evidence.get("run_url", "")):
            raise ValueError("acceptance_gate_missing")
    for service, versions in manifest["services"].items():
        if set(versions) != {"primary", "fallback"}:
            raise ValueError("incomplete_versions")
        for version in versions.values():
            if not re.fullmatch(re.escape(service) + r"-[a-z0-9-]+", version.get("revision", "")) or not re.fullmatch(r"sha256:[a-f0-9]{64}", version.get("digest", "")) or not re.fullmatch(r"[a-f0-9]{40}", version.get("sha", "")):
                raise ValueError("invalid_version")
        if versions["primary"]["sha"] != sha or versions["primary"]["revision"] == versions["fallback"]["revision"]:
            raise ValueError("invalid_primary_fallback")
        if acceptance.get("services", {}).get(service) != versions["primary"]:
            raise ValueError("acceptance_revision_mismatch")


def check_version(service, version, document):
    revision = version["revision"]
    tag = "ghcr-" + version["sha"][:12]
    if tags(document).get(tag, (None,))[0] != revision:
        raise RuntimeError("version_tag_missing")
    row = json.loads(cloud("run", "revisions", "describe", revision, "--format=json"))
    image = "ghcr.io/tommylin15/" + service + "@" + version["digest"]
    images=[c.get("image") for c in row["spec"].get("containers", [])]
    if images != [image] or not row["status"].get("imageDigest", "").endswith("@"+version["digest"]) or not any(c.get("type") == "Ready" and c.get("status") == "True" for c in row["status"].get("conditions", [])):
        raise RuntimeError("version_digest_or_readiness")
    for container in row["spec"].get("containers", []):
        for env in container.get("env", []):
            ref = env.get("valueFrom", {}).get("secretKeyRef")
            if ref:
                if not re.fullmatch(r"[0-9]+",ref["key"]) or not re.fullmatch(r"[A-Za-z0-9_-]{1,255}",ref["name"]):
                    raise RuntimeError("unpinned_secret_reference")
                result = command("gcloud", "secrets", "versions", "describe", ref["key"], "--secret=" + ref["name"], "--project=" + PROJECT, "--format=value(state)")
                if result.strip() != "ENABLED":
                    raise RuntimeError("secret_version_unavailable")
    return tags(document)[tag][1]


def status(url, token=None):
    headers = {"Authorization": "Bearer " + token} if token else {}
    try:
        with urlopen(Request(url, headers=headers), timeout=35) as response:
            return response.status
    except HTTPError as error:
        code = error.code
        error.close()
        return code


def probe(service, url, audience):
    if service == "omniagent-chat":
        for path, expected in (("/health", 200), ("/ready", 200), ("/", 200), ("/main.dart.js", 200), ("/v1/threads", 401)):
            if status(url + path) != expected:
                raise RuntimeError("chat_probe_failed")
        return
    if status(url + "/health") != 403:
        raise RuntimeError("private_iam_boundary_failed")
    caller = "omniagent-chat" if service == "omniagent-agent-gateway" else "omniagent-codex-chat-client"
    account = quote(caller + "@" + PROJECT + ".iam.gserviceaccount.com", safe="")
    access = command("gcloud", "auth", "print-access-token").strip()
    request = Request("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + account + ":generateIdToken",
                      data=json.dumps({"audience": audience, "includeEmail": True}).encode(),
                      headers={"Authorization": "Bearer " + access, "Content-Type": "application/json"})
    with urlopen(request, timeout=25) as response:
        token = json.load(response)["token"]
    for path in ("/health", "/ready") if service == "omniagent-shared-codex" else ("/health",):
        if status(url + path, token) != 200:
            raise RuntimeError("private_probe_failed")


def allocate(service, revision):
    cloud("run", "services", "update-traffic", service, "--to-revisions=" + revision + "=100", "--quiet")


def run(manifest, acceptance):
    evidence = {"source_sha": manifest.get("source_sha"), "validation": "FAIL", "recovery": "NOT_NEEDED", "steps": []}
    before, expected, attempted = {}, {}, set()
    try:
        validate(manifest, acceptance)
        check_source(manifest["source_sha"])
        for service in SERVICES:
            document = snapshot(service)
            before[service] = document
            expected[service] = active(document)
            if len(expected[service]) != 1 or list(expected[service].values()) != [100]:
                raise RuntimeError("split_traffic")
            if expected[service] != {manifest["services"][service]["fallback"]["revision"]:100}:
                raise RuntimeError("current_release_is_not_approved_fallback")
            for version in manifest["services"][service].values():
                url = check_version(service, version, document)
                probe(service, url, document["status"]["url"])
        for role in ("primary", "fallback", "primary"):
            for service in SERVICES:
                check_source(manifest["source_sha"])
                current = snapshot(service)
                protected(before[service], current)
                if active(current) != expected[service]:
                    raise RuntimeError("concurrent_traffic_drift")
                version = manifest["services"][service][role]
                check_version(service, version, current)
                attempted.add(service)
                expected[service] = {version["revision"]: 100}
                allocate(service, version["revision"])
                after = snapshot(service)
                protected(before[service], after)
                if active(after) != expected[service]:
                    raise RuntimeError("traffic_readback_failed")
                probe(service, after["status"]["url"], after["status"]["url"])
                evidence["steps"].append({"service": service, "role": role, "revision": version["revision"], "status": "PASS"})
        for service in SERVICES:
            final = snapshot(service)
            protected(before[service], final)
            if active(final) != expected[service]:
                raise RuntimeError("final_readback_drift")
        evidence["validation"] = "PASS"
    except Exception as error:
        evidence["error_class"] = type(error).__name__
        if attempted:
            evidence["recovery"] = "PASS"
            for service in SERVICES:
                if service not in attempted:
                    continue
                try:
                    current = snapshot(service)
                    protected(before[service], current)
                    if active(current) not in (expected[service], active(before[service])):
                        evidence["recovery"] = "BLOCKED"
                        continue
                    fallback = manifest["services"][service]["fallback"]
                    check_version(service, fallback, current)
                    allocate(service, fallback["revision"])
                    restored = snapshot(service)
                    protected(before[service], restored)
                    if active(restored) != {fallback["revision"]: 100}:
                        raise RuntimeError("recovery_readback_failed")
                    probe(service, restored["status"]["url"], restored["status"]["url"])
                except Exception:
                    evidence["recovery"] = "FAIL"
    return evidence


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--acceptance", required=True)
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    result = run(json.loads(Path(args.manifest).read_text(encoding="utf-8")), json.loads(Path(args.acceptance).read_text(encoding="utf-8")))
    Path(args.evidence).write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))
    raise SystemExit(0 if result["validation"] == "PASS" else 1)
