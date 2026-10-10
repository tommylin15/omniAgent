#!/usr/bin/env python3
"""Read-only GHCR-only formal release preflight. No traffic/Secret mutations.

A zero-traffic candidate smoke is NOT human OAuth, owner/provider execution,
approval/reconnect, a rollback rehearsal, or formal release authorization.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

SERVICES = ("omniagent-chat", "omniagent-agent-gateway", "omniagent-shared-codex")
REPO = "https://github.com/tommylin15/omniAgent.git"
PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
SHA = re.compile(r"^[a-f0-9]{40}$")
DIGEST = re.compile(r"^sha256:[a-f0-9]{64}$")
FALLBACK_SHA = "eb61d6e49746e73ef014bf3493560dc1fc9e6c16"
FALLBACK_DIGEST = {
    "omniagent-chat": "sha256:cde7250dc7cad47fe9caa842247aab853615e3e278d642c1515ee7e55ed2df03",
    "omniagent-agent-gateway": "sha256:1fbe860fb5f1b9c2d53d2a23891ed3f1bf04a6b145697041e95adf7751d4efe0",
    "omniagent-shared-codex": "sha256:888fd90c189ef8a960d9ce4d6590294298340c1046a1b66cf6629ecc3454e453",
}


class Blocked(ValueError):
    pass


def run(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True, timeout=60, check=True).stdout


def current_sha() -> str:
    value = run("git", "ls-remote", REPO, "refs/heads/main").split()
    if len(value) != 2 or value[1] != "refs/heads/main" or not SHA.fullmatch(value[0]):
        raise Blocked("current_main_unknown")
    return value[0]


def gcloud(kind: str, name: str) -> dict:
    if name not in SERVICES and not any(name.startswith(svc + "-") for svc in SERVICES):
        raise Blocked("unexpected_service_or_revision")
    result = run("gcloud", "run", kind, "describe", name,
                 "--project=" + PROJECT, "--region=" + REGION, "--format=json")
    return json.loads(result)


def one(route: list[dict], *, tag: str) -> dict:
    rows = [item for item in route if item.get("tag") == tag]
    if len(rows) != 1 or rows[0].get("percent", 0) != 0:
        raise Blocked("candidate_tag_unavailable_" + tag)
    return rows[0]


def live(route: list[dict]) -> str:
    rows = [item for item in route if item.get("percent", 0) > 0]
    if len(rows) != 1 or type(rows[0].get("percent")) is not int or rows[0]["percent"] != 100:
        raise Blocked("formal_traffic_not_single_100")
    return str(rows[0]["revisionName"])


def image_digest(revision: dict, service: str) -> str:
    containers = (revision.get("spec") or {}).get("containers") or []
    if len(containers) != 1:
        raise Blocked(service + "_unexpected_revision_container_count")
    uri = str(containers[0].get("image", ""))
    if not (uri.startswith("ghcr.io/tommylin15/" + service + "@") or ".pkg.dev/" in uri):
        raise Blocked(service + "_not_ghcr_origin")
    digest = "sha256:" + uri.rsplit("@sha256:", 1)[-1]
    if not DIGEST.fullmatch(digest):
        raise Blocked(service + "_invalid_image_digest")
    return digest


def enabled_secrets(revision: dict, secret_state) -> None:
    """Check both Secret Manager env refs and mounted Secret volumes.

    GCP may allow an old tagged revision to remain Ready even after a
    referenced secret is disabled. Neither kind of reference may be skipped.
    """
    def require_enabled(name, version) -> None:
        if (not isinstance(name, str) or
            not re.fullmatch(r"[A-Za-z0-9_-]{1,255}", name) or
            not isinstance(version, str) or
            not re.fullmatch(r"(latest|[0-9]+)", version)):
            raise Blocked("invalid_secret_reference")
        if secret_state(name, version) != "ENABLED":
            raise Blocked("release_or_fallback_secret_not_enabled")

    spec = revision.get("spec") or {}
    for container in spec.get("containers") or []:
        for row in container.get("env") or []:
            ref = (row.get("valueFrom") or {}).get("secretKeyRef") or {}
            if ref:
                require_enabled(ref.get("name"), ref.get("key"))

    for volume in spec.get("volumes") or []:
        secret = volume.get("secret")
        if secret is None:
            continue
        if not isinstance(secret, dict):
            raise Blocked("invalid_secret_reference")
        name = secret.get("secretName")
        items = secret.get("items")
        if items is None:
            require_enabled(name, "latest")
        elif not isinstance(items, list) or not items:
            raise Blocked("invalid_secret_reference")
        else:
            for item in items:
                if not isinstance(item, dict):
                    raise Blocked("invalid_secret_reference")
                require_enabled(name, item.get("key"))


def audit(source_sha: str, services: dict[str, dict], revisions: dict[str, dict],
          secret_state) -> dict:
    if not SHA.fullmatch(source_sha):
        raise Blocked("invalid_source_sha")
    output = {}
    for svc in SERVICES:
        doc = services[svc]
        traffic = (doc.get("status") or {}).get("traffic") or []
        if not isinstance(traffic, list):
            raise Blocked(svc + "_traffic_unavailable")
        formal = live(traffic)
        if not formal.startswith(svc + "-"):
            raise Blocked(svc + "_formal_revision_invalid")
        candidate = one(traffic, tag="ghcr-" + source_sha[:12])
        fallback = one(traffic, tag="ghcr-" + FALLBACK_SHA[:12])
        current_rev, fallback_rev = candidate.get("revisionName"), fallback.get("revisionName")
        if (not isinstance(current_rev, str) or not current_rev.startswith(svc + "-") or
            not isinstance(fallback_rev, str) or not fallback_rev.startswith(svc + "-") or
            current_rev in (formal, fallback_rev) or fallback_rev == formal):
            raise Blocked(svc + "_revision_identity_collision")
        c = revisions[current_rev]
        f = revisions[fallback_rev]
        for role, rev in (("candidate", c), ("fallback", f)):
            conditions = {r.get("type"): r.get("status") for r in (rev.get("status") or {}).get("conditions") or []}
            if conditions.get("Ready") != "True":
                raise Blocked(svc + "_" + role + "_not_ready")
            enabled_secrets(rev, secret_state)
        primary_digest = image_digest(c, svc)
        if image_digest(f, svc) != FALLBACK_DIGEST[svc]:
            raise Blocked(svc + "_fallback_digest_mismatch")
        template = ((doc.get("spec") or {}).get("template") or {}).get("spec") or {}
        images = [r.get("image") for r in template.get("containers", [])]
        if images != ["ghcr.io/tommylin15/" + svc + "@" + primary_digest]:
            raise Blocked(svc + "_candidate_template_digest_mismatch")
        if svc == "omniagent-chat":
            env = {row.get("name"): row for row in c.get("spec",{}).get("containers",[{}])[0].get("env",[])}
            if any((env.get(k) or {}).get("value") == "true"
                   for k in ("CHAT_DISPATCH_ENABLED", "CHAT_BYOK_MANAGEMENT_ENABLED")):
                raise Blocked("unapproved_model_or_byok_enablement")
        output[svc] = {
            "candidate_revision":current_rev,"fallback_revision":fallback_rev,
            "formal_revision_untouched":formal,"source_image_digest":primary_digest,
            "fallback_image_digest":FALLBACK_DIGEST[svc],
            "candidate_0_percent":True,"fallback_0_percent":True,
            "ready":True,"secret_states":"ENABLED"
        }
    return {"sha":source_sha, "technical_preflight":"PASS",
            "formal_release_gate":"BLOCKED_MISSING_LIVE_APP_ACCEPTANCE",
            "owner_oauth":"NOT_REVERIFIED_FOR_THIS_RELEASE",
            "gateway_provider_dispatch":"NOT_VERIFIED",
            "owner_credentials":"NOT_VERIFIED",
            "approval_cancel_reconnect":"NOT_VERIFIED",
            "ghcr_only_rollback_drill":"NOT_PERFORMED",
            "production_traffic_mutated":False,
            "services":output}


def main(argv: list[str]) -> int:
    if len(argv) != 3 or not SHA.fullmatch(argv[1]):
        raise SystemExit("usage: ghcr_release_readiness.py FULL_SHA output.json")
    sha, target = argv[1:]
    if current_sha() != sha:
        raise Blocked("stale_main")
    services = {svc:gcloud("services", svc) for svc in SERVICES}
    revisions: dict[str,dict] = {}
    for svc, service in services.items():
        traffic = (service.get("status") or {}).get("traffic") or []
        for tag in ("ghcr-" + sha[:12], "ghcr-" + FALLBACK_SHA[:12]):
            revision = one(traffic, tag=tag)["revisionName"]
            revisions[revision] = gcloud("revisions", revision)

    def secret_state(name: str, version: str) -> str:
        return run("gcloud","secrets","versions","describe",version,
                   "--secret="+name,"--project="+PROJECT,"--format=value(state)").strip()

    result = audit(sha,services,revisions,secret_state)
    Path(target).write_text(json.dumps(result,indent=2,sort_keys=True) + "\n")
    print("technical_ghcr_only_release_preflight=PASS")
    print("formal_release_gate=BLOCKED_MISSING_LIVE_APP_ACCEPTANCE")
    print("production_traffic_mutated=NO")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except (Blocked, subprocess.SubprocessError, ValueError, KeyError, OSError) as error:
        print("technical_ghcr_only_release_preflight=BLOCKED")
        print("category=" + (str(error) if isinstance(error, Blocked) else "runtime_readback_failed"))
        sys.exit(1)
