#!/usr/bin/env python3
"""P0-V postrelease revision reduction. NEVER remove tags, IAM or serving traffic.

Default read-only. Delete only untagged stale Revisions after immutable current
runtime snapshots, protected fallback, and an exact fresh-state revalidation.
When >10 revisions have protected tags, report BLOCKED_AT_TEN rather than retire URLs.
"""
from __future__ import annotations
import argparse
from dataclasses import dataclass
import json
import re
import subprocess
import sys
from pathlib import Path

from cloudrun_revision_retention import Blocked, PROJECT, REGION, SERVICES, _date

COUNT = 10
GATEWAY = "omniagent-agent-gateway"
KNOWN_ACTIVE = {
    "omniagent-chat": "omniagent-chat-00069-tep",
    GATEWAY: "omniagent-agent-gateway-00076-pog",
    "omniagent-shared-codex": "omniagent-shared-codex-00046-naj",
}
# Previously verified per-service GHCR fallbacks. These are only candidates
# for protection, never assumed valid until runtime Ready and Secrets readback.
FALLBACKS = {
    "omniagent-chat": "omniagent-chat-00045-fer",
    GATEWAY: "omniagent-agent-gateway-00060-vup",
    "omniagent-shared-codex": "omniagent-shared-codex-00024-naw",
}
GATEWAY_FALLBACK = FALLBACKS[GATEWAY]
_NAME = re.compile(r"^[a-z][a-z0-9-]+$")

@dataclass(frozen=True)
class Plan:
    service: str
    current: str
    keep: tuple[str, ...]
    delete: tuple[str, ...]
    tagged: tuple[str, ...]
    protected_count: int

def cloud(*args: str):
    try:
        proc = subprocess.run(["gcloud", *args, "--project=" + PROJECT,
                               "--region=" + REGION, "--format=json"],
                              check=False, capture_output=True, text=True, timeout=90)
    except (OSError, subprocess.SubprocessError):
        raise Blocked("gcloud_unavailable") from None
    if proc.returncode:
        raise Blocked("gcloud_readback_failed")
    try:
        return json.loads(proc.stdout)
    except ValueError:
        raise Blocked("invalid_gcp_json") from None

def snapshot(svc: str):
    if svc not in SERVICES:
        raise Blocked("invalid_service")
    return (cloud("run", "services", "describe", svc),
            cloud("run", "revisions", "list", "--service=" + svc))

def current(doc: dict, svc: str) -> str:
    status = doc.get("status") or {}
    routes = status.get("traffic")
    if not isinstance(routes, list) or not routes:
        raise Blocked("traffic_unavailable")
    live = [r for r in routes if r.get("percent", 0) > 0]
    if len(live) != 1 or type(live[0].get("percent")) is not int or live[0]["percent"] != 100:
        raise Blocked("serving_not_exactly_100")
    name = live[0].get("revisionName")
    if name != KNOWN_ACTIVE[svc]:
        raise Blocked("formal_serving_drift")
    return name

def tags(doc: dict, svc: str):
    tagnames = set()
    entries = set()
    for r in (doc.get("status") or {}).get("traffic") or []:
        name = r.get("revisionName")
        if not isinstance(name, str) or not name.startswith(svc + "-") or not _NAME.fullmatch(name):
            raise Blocked("invalid_traffic_revision")
        percent = r.get("percent", 0)
        if type(percent) is not int or percent < 0 or percent > 100:
            raise Blocked("invalid_traffic_percent")
        label = r.get("tag")
        if label:
            if not isinstance(label, str) or not _NAME.fullmatch(label) or label in tagnames:
                raise Blocked("invalid_or_duplicate_tag")
            tagnames.add(label)
        entries.add((name, percent, label or "", r.get("url") or ""))
    return entries

def records(revs: list, svc: str):
    if not isinstance(revs, list):
        raise Blocked("invalid_revisions")
    found = {}
    for rev in revs:
        if not isinstance(rev, dict):
            raise Blocked("invalid_revision")
        meta = rev.get("metadata") or {}
        name = meta.get("name") or rev.get("name")
        if not isinstance(name, str) or not name.startswith(svc + "-") or not _NAME.fullmatch(name):
            raise Blocked("unknown_revision")
        if name in found:
            raise Blocked("duplicate_revision")
        found[name] = _date(meta.get("creationTimestamp") or rev.get("createTime"))
    return found

def plan(svc: str, doc: dict, revs: list) -> Plan:
    active = current(doc, svc)
    names = records(revs, svc)
    routes = tags(doc, svc)
    if any(row[0] not in names for row in routes):
        raise Blocked("tag_or_traffic_revision_missing")
    if active not in names:
        raise Blocked("active_revision_missing")
    if FALLBACKS[svc] not in names:
        raise Blocked("approved_fallback_missing")
    # Service itself must stay on the previously accepted P0-V configuration.
    if svc == GATEWAY:
        spec = ((doc.get("spec") or {}).get("template") or {}).get("spec") or {}
        containers = spec.get("containers") or []
        if len(containers) != 1:
            raise Blocked("gateway_container_invalid")
        env = {r.get("name"):r for r in containers[0].get("env") or []}
        if (env.get("GEMINI_SHARED_EXECUTION_ENABLED") or {}).get("value") != "true":
            raise Blocked("gateway_gemini_not_enabled")
        if (env.get("GEMINI_PAID_ENABLED") or {}).get("value") == "true":
            raise Blocked("unexpected_paid_provider_enablement")
    if svc == "omniagent-chat":
        spec = ((doc.get("spec") or {}).get("template") or {}).get("spec") or {}
        cs = spec.get("containers") or []
        if len(cs)!=1:
            raise Blocked("chat_container_invalid")
        env = {r.get("name"):r for r in cs[0].get("env") or []}
        if (env.get("CHAT_DISPATCH_ENABLED") or {}).get("value") == "true":
            raise Blocked("unexpected_chat_dispatch_enablement")
    protected = {active} | {r[0] for r in routes if r[2]}
    protected.add(FALLBACKS[svc])
    # Preserve ALL reachable tagged URLs, even deprecated-looking ones.
    # Keep a minimum of ten newest records if fewer than ten are protected.
    keep = set(protected)
    for name in sorted(names, key=lambda n:(names[n], n), reverse=True):
        if len(keep) >= COUNT:
            break
        keep.add(name)
    ranked = sorted(names, key=lambda n:(names[n], n), reverse=True)
    return Plan(svc, active, tuple(n for n in ranked if n in keep),
                tuple(n for n in ranked if n not in keep),
                tuple(sorted(r[2] for r in routes if r[2])),
                len(protected))

def signature(svc: str, doc: dict, revs: list):
    # Detect new builds, changed revision state, traffic/tag relocation,
    # and service runtime configuration drift between deletion steps.
    status = doc.get("status") or {}
    template = (doc.get("spec") or {}).get("template") or {}
    return (current(doc, svc), frozenset(tags(doc, svc)),
            json.dumps(template, sort_keys=True),
            frozenset(records(revs, svc)),
            status.get("latestCreatedRevisionName"),
            status.get("latestReadyRevisionName"))

def check_backup(svc: str, p: Plan) -> str:
    # Confirm exact pinned historical rollback, not just existence in list.
    candidate = FALLBACKS[svc]
    if candidate == p.current or candidate not in p.keep:
        raise Blocked("backup_not_explicitly_verified")
    rev = cloud("run", "revisions", "describe", candidate)
    ready = any(r.get("type") == "Ready" and r.get("status") == "True"
                for r in (rev.get("status") or {}).get("conditions") or [])
    if not ready:
        raise Blocked("backup_not_ready")
    try:
        from ghcr_release_readiness import enabled_secrets
        def secret_state(name: str, version: str) -> str:
            proc = subprocess.run(["gcloud","secrets","versions","describe",version,
                "--secret="+name,"--project="+PROJECT,"--format=value(state)"],
                capture_output=True,text=True,timeout=60)
            if proc.returncode:
                raise Blocked("fallback_secret_metadata_unavailable")
            return proc.stdout.strip()
        enabled_secrets(rev,secret_state)
    except (OSError,subprocess.SubprocessError,ValueError):
        raise Blocked("fallback_secret_reference_not_usable") from None
    return candidate

def receipt(p: Plan) -> dict:
    return {"service": p.service, "formal": p.current,
            "protected_revisions":p.protected_count,
            "tag_count":len(p.tagged), "tag_names":list(p.tagged),
            "revisions_before":len(p.keep)+len(p.delete),
            "retained":list(p.keep), "proposed_delete":list(p.delete),
            "revisions_after_if_applied":len(p.keep),
            "ten_policy_possible_without_tag_retirement":len(p.keep)<=COUNT,
            "tags_retired":[],"deleted":[]}

def process(svc: str, apply: bool):
    before, revs = snapshot(svc)
    p=plan(svc,before,revs)
    report=receipt(p)
    report["status"]="DRY_RUN" if not apply else "BLOCKED"
    if not apply:
        return report
    # Explicit previous-formal fallback is presently verified only for Gateway.
    # Do not perform destructive Chat/Shared cleanup without an approved rollback.
    report["verified_fallback"] = check_backup(svc,p)
    stable = signature(svc,before,revs)
    for deletion in p.delete:
        live, fresh_revs = snapshot(svc)
        after_sig = signature(svc,live,fresh_revs)
        if after_sig[0:3] != stable[0:3] or after_sig[4:] != stable[4:]:
            raise Blocked("runtime_or_tag_changed")
        remaining = set(stable[3]) - set(report["deleted"])
        if set(after_sig[3]) != remaining:
            raise Blocked("revision_inventory_changed")
        if deletion not in remaining or deletion in p.keep:
            raise Blocked("deletion_target_no_longer_safe")
        # Recheck current tag/protected state before every irreversible mutation.
        if deletion in {row[0] for row in tags(live,svc)}:
            raise Blocked("revision_is_tagged_or_serving")
        try:
            proc=subprocess.run(["gcloud","run","revisions","delete",deletion,
                        "--project="+PROJECT,"--region="+REGION,"--quiet"],
                        capture_output=True, text=True, timeout=120)
        except (OSError,subprocess.SubprocessError):
            raise Blocked("deletion_command_failed") from None
        if proc.returncode:
            raise Blocked("deletion_command_failed")
        report["deleted"].append(deletion)
    live, fresh_revs=snapshot(svc)
    after_sig=signature(svc,live,fresh_revs)
    if after_sig[0:3] != stable[0:3] or set(after_sig[3]) != set(p.keep):
        raise Blocked("post_deletion_readback_mismatch")
    report["status"]="PASS"
    return report

def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--mode",choices=("inventory","apply"),default="inventory")
    parser.add_argument("--service",choices=SERVICES,required=True)
    parser.add_argument("--receipt",required=True)
    args=parser.parse_args()
    try:
        report=process(args.service,args.mode=="apply")
        Path(args.receipt).write_text(json.dumps(report,sort_keys=True,indent=2)+"\n")
        print("service="+args.service+" status="+report["status"]+
              " revisions_before="+str(report["revisions_before"])+
              " deletable_untagged="+str(len(report["proposed_delete"]))+
              " keep="+str(report["revisions_after_if_applied"])+
              " tag_count="+str(report["tag_count"]))
        return 0
    except (Blocked, ValueError, OSError, KeyError, TypeError) as exc:
        code=str(exc) if isinstance(exc,Blocked) else "runtime_readback_failed"
        print("service="+args.service+" status=BLOCKED reason="+code)
        return 1
if __name__=="__main__":
    sys.exit(main())
