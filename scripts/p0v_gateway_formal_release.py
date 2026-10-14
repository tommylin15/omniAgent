#!/usr/bin/env python3
"""P0-V Gateway-only formal promotion. No other service, IAM or cleanup mutations."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
GATEWAY = "omniagent-agent-gateway"
OTHER_SERVICES = ("omniagent-chat", "omniagent-shared-codex")
PILOT_TAG = "p0v-market2048-00d45861"
MODEL = "gemini-3.5-flash-lite"
REPO = "https://github.com/tommylin15/omniAgent.git"
AUDIENCE_PATTERN = re.compile(r"^https://omniagent-agent-gateway-[a-z0-9-]+\.a\.run\.app$")
IMAGE_PATTERN = re.compile(r"^(?:cache\.us-docker\.pkg\.dev/)?(ghcr\.io/tommylin15/omniagent-agent-gateway@sha256:[0-9a-f]{64})$")
EXPECTED = {
    "omniagent": "omniagent-codex-chat-client@" + PROJECT + ".iam.gserviceaccount.com",
    "market-mart": "omniagent-codex-market-client@" + PROJECT + ".iam.gserviceaccount.com",
    "life-assistant": "omniagent-codex-life-client@" + PROJECT + ".iam.gserviceaccount.com",
}
FLAGS = ("GEMINI_SHARED_EXECUTION_ENABLED", "GEMINI_SHARED_AUDIENCE",
         "GEMINI_SHARED_MODEL", "GEMINI_SHARED_CALLERS_JSON")
class Blocked(Exception):
    pass

def safe_run(*args: str, timeout: int = 120) -> str:
    # Exceptions never reveal argv, tokens, CLI stderr, env or provider payload.
    try:
        p = subprocess.run(args, capture_output=True, text=True, check=False, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        raise Blocked("command_unavailable") from None
    if p.returncode:
        raise Blocked("cloud_command_failed")
    return p.stdout

def cloud(kind: str, name: str) -> dict:
    return json.loads(safe_run("gcloud", "run", kind, "describe", name,
                              "--project=" + PROJECT, "--region=" + REGION, "--format=json"))

def service(name: str) -> dict:
    return cloud("services", name)

def revision(name: str) -> dict:
    if not name.startswith(GATEWAY + "-") or not re.fullmatch(r"[a-z0-9-]+", name):
        raise Blocked("revision_name_invalid")
    return cloud("revisions", name)

def routes(s: dict) -> list[dict]:
    out = (s.get("status") or {}).get("traffic")
    if not isinstance(out, list):
        raise Blocked("traffic_unknown")
    return out

def live(s: dict) -> str:
    current = [x for x in routes(s) if x.get("percent", 0) > 0]
    if len(current) != 1 or current[0].get("percent") != 100:
        raise Blocked("formal_traffic_not_single_100")
    return current[0]["revisionName"]

def tagged(s: dict, tag: str) -> dict:
    x = [row for row in routes(s) if row.get("tag") == tag and row.get("percent", 0) == 0]
    if len(x) != 1:
        raise Blocked("zero_traffic_tag_missing")
    return x[0]

def ready(rev: dict) -> bool:
    return any(x.get("type") == "Ready" and x.get("status") == "True"
               for x in (rev.get("status") or {}).get("conditions") or [])

def specs(doc: dict, is_service: bool) -> dict:
    if is_service:
        return ((doc.get("spec") or {}).get("template") or {}).get("spec") or {}
    return doc.get("spec") or {}

def container(doc: dict, is_service: bool) -> dict:
    parts = specs(doc, is_service).get("containers") or []
    if len(parts) != 1:
        raise Blocked("container_count_invalid")
    return parts[0]

def environment(doc: dict, is_service: bool) -> dict:
    rows = container(doc, is_service).get("env") or []
    names = [x.get("name") for x in rows]
    if len(set(names)) != len(names) or any(not isinstance(x, str) or not x for x in names):
        raise Blocked("environment_shape_invalid")
    return {x["name"]: x for x in rows}

def expected_flags(audience: str) -> dict:
    return {
        "GEMINI_SHARED_EXECUTION_ENABLED": "true",
        "GEMINI_SHARED_AUDIENCE": audience,
        "GEMINI_SHARED_MODEL": MODEL,
        "GEMINI_SHARED_CALLERS_JSON": json.dumps(EXPECTED, separators=(",", ":")),
    }

def assert_flags(doc: dict, is_service: bool, audience: str) -> None:
    env = environment(doc, is_service)
    flags = expected_flags(audience)
    if any((env.get(k) or {}).get("value") != value for k, value in flags.items()):
        raise Blocked("gemini_config_mismatch")
    if (env.get("GEMINI_PAID_ENABLED") or {}).get("value") == "true":
        raise Blocked("paid_tier_forbidden")
    if "GEMINI_API_KEY" not in env:
        raise Blocked("provider_secret_reference_missing")

def protected_same(before: dict, after: dict, audience: str) -> None:
    # Compare existing identity, networking, all non-P0V env and secret references.
    b, a = specs(before, True), specs(after, True)
    for field in ("serviceAccountName", "vpcAccess", "volumes"):
        if b.get(field) != a.get(field):
            raise Blocked("identity_network_or_secret_drift")
    be, ae = environment(before, True), environment(after, True)
    if {k: v for k, v in be.items() if k not in FLAGS} != {
            k: v for k, v in ae.items() if k not in FLAGS}:
        raise Blocked("unapproved_environment_drift")
    assert_flags(after, True, audience)
    for doc in (before, after):
        if (doc.get("metadata") or {}).get("name") != GATEWAY:
            raise Blocked("service_identity_drift")
    if (before.get("metadata") or {}).get("annotations", {}).get("run.googleapis.com/ingress") != (
        (after.get("metadata") or {}).get("annotations", {}).get("run.googleapis.com/ingress")
    ):
        raise Blocked("ingress_drift")

def iam_check() -> None:
    obj = json.loads(safe_run("gcloud", "run", "services", "get-iam-policy", GATEWAY,
                              "--project=" + PROJECT, "--region=" + REGION, "--format=json"))
    members = {m for r in obj.get("bindings") or [] if r.get("role") == "roles/run.invoker"
               for m in r.get("members") or []}
    if any("serviceAccount:" + email not in members for email in EXPECTED.values()):
        raise Blocked("dedicated_invoker_missing")
    if "allUsers" in members or "allAuthenticatedUsers" in members:
        raise Blocked("gateway_must_remain_private")

def preflight() -> dict:
    snapshots = {name: service(name) for name in (GATEWAY,) + OTHER_SERVICES}
    gate = snapshots[GATEWAY]
    active = live(gate)
    if not active.startswith(GATEWAY + "-"):
        raise Blocked("unrecognized_serving_revision")
    pilot = tagged(gate, PILOT_TAG)["revisionName"]
    prior = revision(pilot)
    formal = revision(active)
    if not ready(prior) or not ready(formal):
        raise Blocked("candidate_or_rollback_not_ready")
    canonical = (gate.get("status") or {}).get("url", "").rstrip("/")
    if not AUDIENCE_PATTERN.fullmatch(canonical):
        raise Blocked("audience_invalid")
    assert_flags(prior, False, canonical)
    candidate_image = container(prior, False).get("image", "")
    matched = IMAGE_PATTERN.fullmatch(candidate_image)
    if not matched:
        raise Blocked("pilot_not_immutable_ghcr")
    iam_check()
    others = {name: live(snapshots[name]) for name in OTHER_SERVICES}
    return {"before": active, "pilot": pilot, "image": matched.group(1),
            "audience": canonical, "others": others, "snapshot": gate}

def check_others(expected: dict) -> None:
    for name, rev in expected.items():
        if live(service(name)) != rev:
            raise Blocked("other_service_traffic_changed")

def check_new(baseline: dict, candidate: str, tag: str) -> None:
    now = service(GATEWAY)
    if live(now) != baseline["before"]:
        raise Blocked("gateway_traffic_changed_before_promotion")
    if tagged(now, tag)["revisionName"] != candidate:
        raise Blocked("release_candidate_tag_changed")
    status = now.get("status") or {}
    if status.get("latestCreatedRevisionName") != candidate or status.get("latestReadyRevisionName") != candidate:
        raise Blocked("new_release_revision_not_ready")
    rev = revision(candidate)
    if not ready(rev):
        raise Blocked("new_release_revision_not_ready")
    protected_same(baseline["snapshot"], now, baseline["audience"])
    if container(now, True).get("image") != baseline["image"]:
        raise Blocked("image_digest_changed")
    assert_flags(rev, False, baseline["audience"])
    check_others(baseline["others"])
    iam_check()

def id_token(audience: str) -> str:
    bearer = safe_run("gcloud", "auth", "print-access-token").strip()
    principal = EXPECTED["market-mart"]
    endpoint = ("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"
                + urllib.parse.quote(principal, safe="") + ":generateIdToken")
    req = urllib.request.Request(endpoint, method="POST",
        data=json.dumps({"audience": audience, "includeEmail": True}).encode(),
        headers={"Authorization": "Bearer " + bearer, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            value = json.load(res)["token"]
    except (urllib.error.URLError, KeyError, ValueError):
        raise Blocked("signed_token_unavailable") from None
    return value

def http_code(url: str, payload: dict | None, token: str | None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, method="POST" if payload else "GET",
         data=json.dumps(payload).encode() if payload else None, headers=headers)
    try:
        res = urllib.request.urlopen(req, timeout=80)
    except urllib.error.HTTPError as exc:
        res = exc
    except urllib.error.URLError:
        raise Blocked("gateway_http_unavailable") from None
    try:
        with res:
            code = res.status
            body = json.load(res) if payload else {}
            return code, body
    except (ValueError, OSError):
        raise Blocked("gateway_json_unavailable") from None

def smoke(url: str, audience: str) -> None:
    # Exactly one very short billable inference per smoke, never auto-retry.
    token = id_token(audience)
    reqid = str(uuid.uuid4())
    payload = {"project": "market-mart",
               "ownerId": "00000000-0000-4000-8000-000000000001",
               "requestId": reqid, "prompt": "Reply exactly OK.", "model": MODEL}
    code, body = http_code(url + "/v1/gemini/execute", payload, token)
    if code != 200 or body.get("status") != "completed" or body.get("requestId") != reqid or (
            body.get("model") != MODEL or not isinstance(body.get("result", {}).get("text"), str)
            or not body["result"]["text"].strip()):
        raise Blocked("positive_gemini_smoke_failed")
    payload["project"] = "life-assistant"
    code, body = http_code(url + "/v1/gemini/execute", payload, token)
    if code != 403 or body.get("error") != "caller_project_mismatch":
        raise Blocked("cross_project_denial_failed")
    status, _ = http_code(url + "/health", None, None)
    if status != 403:
        raise Blocked("anonymous_gateway_not_denied")

def traffic(revision_name: str) -> None:
    safe_run("gcloud", "run", "services", "update-traffic", GATEWAY,
             "--to-revisions=" + revision_name + "=100",
             "--project=" + PROJECT, "--region=" + REGION, "--quiet")

def current_main() -> str:
    s = safe_run("git", "ls-remote", REPO, "refs/heads/main").split()
    if len(s) != 2 or s[1] != "refs/heads/main" or not re.fullmatch(r"[a-f0-9]{40}", s[0]):
        raise Blocked("main_sha_unknown")
    return s[0]

def publish(baseline: dict, source_sha: str) -> str:
    tag = "p0v-formal-" + source_sha[:8]
    flags = expected_flags(baseline["audience"])
    if any("~" in v or "^" in v for v in flags.values()):
        raise Blocked("environment_delimiter_invalid")
    update = "^~^" + "~".join(k + "=" + v for k, v in flags.items())
    safe_run("gcloud", "run", "deploy", GATEWAY,
             "--project=" + PROJECT, "--region=" + REGION,
             "--image=" + baseline["image"], "--no-traffic", "--tag=" + tag,
             "--update-env-vars=" + update, "--quiet", timeout=180)
    after = service(GATEWAY)
    candidate = tagged(after, tag)["revisionName"]
    check_new(baseline, candidate, tag)
    return candidate

def execute(mode: str, confirm: str, source_sha: str, receipt_path: str) -> int:
    report = {"status": "BLOCKED", "phase": mode, "traffic_mutation_attempted": False,
              "model_calls_attempted_max": 0, "revision_cleanup_attempted": False,
              "other_service_mutations": False, "emergency_recovery": "NOT_NEEDED"}
    baseline = None
    switched = False
    try:
        if mode == "activate":
            if confirm != "ACTIVATE_P0V_GATEWAY_ONLY" or not re.fullmatch(r"[0-9a-f]{40}", source_sha):
                raise Blocked("explicit_release_authorization_missing")
            if current_main() != source_sha:
                raise Blocked("stale_main")
        baseline = preflight()
        report["previous_formal_revision"] = baseline["before"]
        report["approved_pilot_revision"] = baseline["pilot"]
        if mode == "preflight":
            report["status"] = "PREFLIGHT_PASS_NO_MUTATIONS"
            print("gateway_only_preflight=PASS_NO_MUTATIONS")
            return 0
        candidate = publish(baseline, source_sha)
        report["new_candidate_revision"] = candidate
        tag = "p0v-formal-" + source_sha[:8]
        route = tagged(service(GATEWAY), tag)
        report["model_calls_attempted_max"] = 1
        smoke(route["url"].rstrip("/"), baseline["audience"])
        check_new(baseline, candidate, tag)
        report["traffic_mutation_attempted"] = True
        switched = True  # Recovery even if the gcloud call succeeds then reports an error.
        traffic(candidate)
        now = service(GATEWAY)
        if live(now) != candidate or not ready(revision(candidate)):
            raise Blocked("formal_gateway_promotion_readback_failed")
        check_others(baseline["others"])
        iam_check()
        report["model_calls_attempted_max"] = 2
        smoke(baseline["audience"], baseline["audience"])
        if live(service(GATEWAY)) != candidate:
            raise Blocked("post_smoke_traffic_drift")
        check_others(baseline["others"])
        report["status"] = "PASS"
        print("gateway_only_production_live_accepted=PASS")
        return 0
    except (Blocked, KeyError, ValueError, OSError, TypeError) as exc:
        report["status"] = "BLOCKED"
        report["reason"] = str(exc) if isinstance(exc, Blocked) else "runtime_readback_failed"
        if switched and baseline:
            try:
                traffic(baseline["before"])
                if live(service(GATEWAY)) != baseline["before"]:
                    raise Blocked("fallback_traffic_readback_failed")
                report["emergency_recovery"] = "PASS"
            except (Blocked, OSError):
                report["emergency_recovery"] = "FAILED"
        print("gateway_only_release=BLOCKED reason=" + report["reason"])
        return 1
    finally:
        Path(receipt_path).write_text(json.dumps(report, sort_keys=True, indent=2) + "\n")

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=("preflight", "activate"), required=True)
    p.add_argument("--confirm", default="")
    p.add_argument("--source-sha", default="")
    p.add_argument("--receipt", required=True)
    a = p.parse_args()
    return execute(a.mode, a.confirm, a.source_sha, a.receipt)

if __name__ == "__main__":
    sys.exit(main())
