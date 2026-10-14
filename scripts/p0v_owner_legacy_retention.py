#!/usr/bin/env python3
"""Explicitly authorized P0-V legacy Cloud Run cleanup: retain ten per service.

The Owner authorized retirement of old revisions AND their 0%-traffic tags,
including obsolete tagged test URLs, without investigation of historic usage.
This is intentionally separate from all GHCR image, production rollout and IAM
operations. Fail closed on unexpected serving configuration or live drift.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from dataclasses import dataclass
from pathlib import Path
import re
import subprocess
import sys

from cloudrun_revision_retention import Blocked, PROJECT, REGION, _date
from ghcr_release_readiness import enabled_secrets
from p0v_safe_revision_cleanup import KNOWN_ACTIVE, SERVICES, current, records, tags, snapshot

EXPECTED_COUNTS = {
    "omniagent-chat": 20,
    "omniagent-agent-gateway": 21,
    "omniagent-shared-codex": 17,
}
EXPECTED_DIGEST_PREFIX = {
    "omniagent-chat": "eeab8196eed3",
    "omniagent-agent-gateway": "291e80728500",
    "omniagent-shared-codex": "fc696d522f1c",
}
TARGET = 10
DIGEST = re.compile(r"@sha256:([0-9a-f]{64})$")
TAG = re.compile(r"^[a-z][a-z0-9-]{0,62}$")
REV = re.compile(r"^[a-z][a-z0-9-]+$")
TAG_LIMIT = 90

@dataclass(frozen=True)
class Plan:
    service: str
    active: str
    fallback: str
    keep: tuple[str, ...]
    delete: tuple[str, ...]
    remove_tags: tuple[str, ...]
    preserve_tags: tuple[str, ...]
    before: int

def cli(*args: str, timeout: int=120, json_result: bool=False):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        raise Blocked("cloud_command_unavailable") from None
    if result.returncode:
        raise Blocked("cloud_command_failed")
    if not json_result:
        return ""
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise Blocked("invalid_cloud_json") from None

def revision(name: str, svc: str) -> dict:
    if not name.startswith(svc+"-") or not REV.fullmatch(name):
        raise Blocked("revision_name_outside_scope")
    return cli("gcloud","run","revisions","describe",name,
        "--project="+PROJECT,"--region="+REGION,"--format=json",json_result=True)

def ready(doc: dict) -> bool:
    return any(x.get("type")=="Ready" and x.get("status")=="True"
               for x in (doc.get("status") or {}).get("conditions") or [])

def only_container(doc: dict, is_service: bool) -> dict:
    spec=(doc.get("spec") or {})
    if is_service:
        spec=((spec.get("template") or {}).get("spec") or {})
    rows=spec.get("containers") or []
    if len(rows)!=1:
        raise Blocked("unexpected_container_count")
    return rows[0]

def env_map(cont: dict) -> dict:
    fields=cont.get("env") or []
    names=[r.get("name") for r in fields]
    if any(not isinstance(n,str) or not n for n in names) or len(set(names))!=len(names):
        raise Blocked("environment_invalid")
    return {r["name"]:r for r in fields}

def feature_guard(svc: str, formal: dict, serving_rev: dict):
    image=str(only_container(serving_rev,False).get("image",""))
    match=DIGEST.search(image)
    if not match or not match.group(1).startswith(EXPECTED_DIGEST_PREFIX[svc]):
        raise Blocked("formal_image_digest_drift")
    if not ready(serving_rev):
        raise Blocked("formal_revision_not_ready")
    env=env_map(only_container(serving_rev,False))
    if svc == "omniagent-agent-gateway":
        if (env.get("GEMINI_SHARED_EXECUTION_ENABLED") or {}).get("value")!="true":
            raise Blocked("formal_gemini_not_enabled")
        if (env.get("GEMINI_PAID_ENABLED") or {}).get("value")=="true":
            raise Blocked("paid_provider_unexpected")
    if svc == "omniagent-chat" and (env.get("CHAT_DISPATCH_ENABLED") or {}).get("value")=="true":
        raise Blocked("chat_dispatch_unexpected")
    status=formal.get("status") or {}
    if current(formal,svc)!=KNOWN_ACTIVE[svc]:
        raise Blocked("serving_revision_drift")
    if not status.get("url"):
        raise Blocked("formal_service_url_missing")

def fallback_guard(svc: str, candidate: dict, formal_rev: dict) -> bool:
    if not ready(candidate):
        return False
    active_spec=formal_rev.get("spec") or {}
    other_spec=candidate.get("spec") or {}
    if active_spec.get("serviceAccountName") != other_spec.get("serviceAccountName"):
        return False
    try:
        a=env_map(only_container(formal_rev,False))
        b=env_map(only_container(candidate,False))
    except Blocked:
        return False
    if svc == "omniagent-agent-gateway":
        # Preserve a rollback that can still serve Gemini, not a disabled pilot.
        for key in ("GEMINI_SHARED_EXECUTION_ENABLED","GEMINI_SHARED_MODEL"):
            if (a.get(key) or {}).get("value")!=(b.get(key) or {}).get("value"):
                return False
    if svc == "omniagent-chat":
        if (b.get("CHAT_DISPATCH_ENABLED") or {}).get("value")=="true":
            return False
    if (b.get("GEMINI_PAID_ENABLED") or {}).get("value")=="true":
        return False
    # Read Secret version state only, never payload.
    def secret_state(name: str, version: str) -> str:
        result=cli("gcloud","secrets","versions","describe",version,
            "--secret="+name,"--project="+PROJECT,"--format=json",json_result=True)
        return str(result.get("state",""))
    try:
        enabled_secrets(candidate,secret_state)
    except (Blocked, ValueError, KeyError):
        return False
    return True

def planning(svc: str, service: dict, revisions: list,
             read_revision=revision) -> Plan:
    if svc not in SERVICES:
        raise Blocked("unexpected_service")
    live=current(service,svc)
    # Build/release CI may create new 0% candidates between checkpoints.
    # Always use a fresh exact snapshot, never guess a stale fixed count.
    if not isinstance(revisions,list) or not TARGET <= len(revisions) <= 100:
        raise Blocked("revision_count_outside_safe_bounds")
    ranked=records(revisions,svc)
    routes=tags(service,svc)
    if len(ranked)!=len(revisions):
        raise Blocked("revision_identity_inconsistent")
    if any(row[0] not in ranked for row in routes):
        raise Blocked("dangling_live_tag_revision")
    latest=sorted(ranked,key=lambda n:(ranked[n],n),reverse=True)
    keep=set(latest[:TARGET])
    if live not in keep:
        keep.remove(latest[TARGET-1])
        keep.add(live)
    keep_names=tuple(x for x in latest if x in keep)
    remove=tuple(x for x in latest if x not in keep)
    # The approved strategy retains exactly ten, even if a deliberately tagged
    # Preview/test URL happens to be old: that tag will be retired first.
    if len(keep_names)!=TARGET or len(remove)!=len(latest)-TARGET:
        raise Blocked("invalid_protected_ten_plan")
    formal_rev=read_revision(live,svc)
    feature_guard(svc,service,formal_rev)
    fallback=None
    # Search newer READY revisions first, but require same operational identity,
    # Secret viability, and critical provider flags as the formal release.
    for name in keep_names:
        if name==live:
            continue
        cand=read_revision(name,svc)
        if fallback_guard(svc,cand,formal_rev):
            fallback=name
            break
    if not fallback:
        raise Blocked("no_viable_rollback_within_newest_ten")
    remove_tags=tuple(sorted({tag for name,_,tag,_ in routes if tag and name not in keep}))
    keep_tags=tuple(sorted({tag for name,_,tag,_ in routes if tag and name in keep}))
    if len(remove_tags)>TAG_LIMIT:
        raise Blocked("too_many_tags_to_retire")
    return Plan(svc,live,fallback,keep_names,remove,remove_tags,keep_tags,len(ranked))

def tag_map(service: dict, svc: str) -> dict:
    mapping={}
    for name,pct,tag,url in tags(service,svc):
        if tag:
            mapping[tag]=name
    return mapping

def stable(service: dict, svc: str, expected_active: str, expected_template: str,
           expected_tags: dict):
    if current(service,svc)!=expected_active:
        raise Blocked("formal_traffic_modified")
    if json.dumps((service.get("spec") or {}).get("template"),sort_keys=True)!=expected_template:
        raise Blocked("formal_template_modified")
    if tag_map(service,svc)!=expected_tags:
        raise Blocked("traffic_tags_changed")

def approved_receipt(plan: Plan):
    return {
        "service":plan.service, "status":"DRY_RUN", "before":plan.before,
        "target":TARGET, "active_revision":plan.active,
        "verified_viable_fallback":plan.fallback,
        "retained":list(plan.keep), "delete_planned":list(plan.delete),
        "tags_retire_planned":list(plan.remove_tags),
        "tags_keep":list(plan.preserve_tags),
        "deleted":[], "tags_retired":[],
        "iam_modified":False,"formal_traffic_changed":False,
        "provider_requests":0,"other_service_modified":False,
    }

def operate(service_name: str, apply: bool, destination: Path):
    snap, revs=snapshot(service_name)
    plan=planning(service_name,snap,revs)
    report=approved_receipt(plan)
    def checkpoint():
        destination.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n")
    checkpoint()
    if not apply:
        return report
    main_template=json.dumps((snap.get("spec") or {}).get("template"),sort_keys=True)
    before_tags=tag_map(snap,service_name)
    if plan.remove_tags:
        # Verify exact fresh readback BEFORE irreversible tag URL retirement.
        fresh, all_revs=snapshot(service_name)
        stable(fresh,service_name,plan.active,main_template,before_tags)
        if set(records(all_revs,service_name))!=set(records(revs,service_name)):
            raise Blocked("pre_tag_revision_inventory_changed")
        cli("gcloud","run","services","update-traffic",service_name,
            "--project="+PROJECT,"--region="+REGION,
            "--remove-tags="+",".join(plan.remove_tags),"--quiet")
        report["tags_retired"]=list(plan.remove_tags)
        report["status"]="TAG_RETIREMENT_APPLIED_REVISION_DELETION_PENDING"
        checkpoint()
    remaining_tags={k:v for k,v in before_tags.items() if k not in plan.remove_tags}
    after, after_revs=snapshot(service_name)
    stable(after,service_name,plan.active,main_template,remaining_tags)
    if set(records(after_revs,service_name))!=set(records(revs,service_name)):
        raise Blocked("post_tag_inventory_drift")
    # Recheck selected rollback viability after tag retirement.
    active_now=revision(plan.active,service_name)
    if not fallback_guard(service_name,revision(plan.fallback,service_name),active_now):
        raise Blocked("fallback_became_unusable")
    for item in plan.delete:
        live_doc, live_revs=snapshot(service_name)
        stable(live_doc,service_name,plan.active,main_template,remaining_tags)
        expected=set(records(revs,service_name))-set(report["deleted"])
        if set(records(live_revs,service_name))!=expected:
            raise Blocked("revision_inventory_drift")
        if item not in expected or item in plan.keep:
            raise Blocked("unexpected_deletion_target")
        if item in {name for name,_,_,_ in tags(live_doc,service_name)}:
            raise Blocked("still_tagged_or_serving")
        cli("gcloud","run","revisions","delete",item,
            "--project="+PROJECT,"--region="+REGION,"--quiet")
        report["deleted"].append(item)
        report["status"]="DELETION_IN_PROGRESS"
        checkpoint()
    final, final_revs=snapshot(service_name)
    stable(final,service_name,plan.active,main_template,remaining_tags)
    if set(records(final_revs,service_name))!=set(plan.keep):
        raise Blocked("post_delete_revision_identity_mismatch")
    if not ready(revision(plan.fallback,service_name)):
        raise Blocked("rollback_readback_not_ready")
    report["status"]="PASS"
    checkpoint()
    return report

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--service",choices=SERVICES,required=True)
    p.add_argument("--mode",choices=["plan","apply"],default="plan")
    p.add_argument("--receipt",required=True)
    args=p.parse_args()
    destination=Path(args.receipt)
    try:
        doc=operate(args.service,args.mode=="apply",destination)
        print("retention_service="+args.service+" status="+doc["status"]+
              " before="+str(doc["before"])+" after="+str(len(doc["retained"]))+
              " deleted="+str(len(doc["deleted"]))+
              " tags_retired="+str(len(doc["tags_retired"])))
    except (Blocked,OSError,ValueError,KeyError,TypeError) as exc:
        reason=str(exc) if isinstance(exc,Blocked) else "runtime_readback_failed"
        if destination.exists():
            data=json.loads(destination.read_text())
            data["status"]="PARTIAL_OR_BLOCKED"
            data["reason"]=reason
            destination.write_text(json.dumps(data,sort_keys=True,indent=2)+"\n")
        print("retention_service="+args.service+" status=BLOCKED reason="+reason)
        sys.exit(1)

if __name__=="__main__":
    main()
