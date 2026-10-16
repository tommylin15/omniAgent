#!/usr/bin/env python3
"""Retire obsolete tags outside the protected ten Cloud Run revisions.

A destructive tag URL operation, deliberately separate from Revision deletion.
Designed for the gated GHCR-only post-promotion retention workflow.
No effect until --apply, and unsafe/missing runtime evidence fails closed.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from dataclasses import dataclass
import json
import re
import subprocess
import sys

from cloudrun_revision_retention import (
    Blocked, PROJECT, REGION, RETAIN_COUNT, SERVICES, _date,
    select_plan, snapshots,
)

TAG = re.compile(r"[a-z][a-z0-9-]{0,62}\Z")


@dataclass(frozen=True)
class TagPlan:
    service: str
    promoted: str
    rollback: str
    remove_tags: tuple[str, ...]
    keep_revisions: tuple[str, ...]


def _tag_routes(snapshot: dict) -> dict[str, str]:
    traffic = (snapshot.get("status") or {}).get("traffic")
    if not isinstance(traffic, list):
        raise Blocked("missing_traffic_readback")
    found = {}
    for entry in traffic:
        if not isinstance(entry, dict):
            raise Blocked("invalid_traffic_entry")
        tag = entry.get("tag")
        if not tag:
            continue
        if not isinstance(tag, str) or not TAG.fullmatch(tag):
            raise Blocked("unapproved_or_invalid_tag")
        if tag in found:
            raise Blocked("duplicate_traffic_tag")
        revision = entry.get("revisionName")
        if not isinstance(revision, str) or not revision:
            raise Blocked("tag_without_revision")
        found[tag] = revision
    return found


def _serving(snapshot: dict) -> tuple[str, int]:
    traffic = (snapshot.get("status") or {}).get("traffic") or []
    active = [(r.get("revisionName"), r.get("percent")) for r in traffic
              if isinstance(r, dict) and r.get("percent", 0) > 0]
    if len(active) != 1 or active[0][1] != 100:
        raise Blocked("not_single_100_percent_approved_serving")
    return active[0]


def plan_tags(service: str, snapshot: dict, revisions: list,
              promoted: str, rollback: str) -> TagPlan:
    """Make a safe plan *only* if new-GHCR is already serving 100%."""
    if service not in SERVICES:
        raise Blocked("unknown_service")
    # Inspect the exact protected retention plan *without* mutating tagged
    # URLs; only this planner may temporarily tolerate removable obsolete
    # tags before a simulated plan proves that the result is deletion-safe.
    tags = _tag_routes(snapshot)
    protected = select_plan(service, snapshot, revisions, promoted, rollback,
                            allow_obsolete_tag_routes=True)
    retained = set(protected.keep)
    obsolete = tuple(sorted(tag for tag,rev in tags.items() if rev not in retained))
    if "preview" in obsolete or any(tag.startswith("p0-trial-") for tag in obsolete):
        raise Blocked("protected_preview_or_owner_trial_tag_cannot_be_retired")
    # Simulate only the requested tag removal; select_plan validates actual
    # serving allocation, newest Ready/created revision and full retention.
    simulated = deepcopy(snapshot)
    for route in (simulated.get("status") or {}).get("traffic") or []:
        if route.get("tag") in obsolete:
            route.pop("tag",None)
            route.pop("url",None)
    check = select_plan(service, simulated, revisions, promoted, rollback)
    if _serving(snapshot) != (promoted,100):
        raise Blocked("promoted_ghcr_not_serving_100_percent")
    return TagPlan(service,promoted,rollback,obsolete,check.keep)


def retire(service: str, promoted: str, rollback: str, apply: bool) -> dict:
    before, revs = snapshots(service)
    plan = plan_tags(service, before, revs, promoted, rollback)
    receipt = {"service":service,"mode":"APPLY" if apply else "DRY_RUN",
        "planned_tag_removals":list(plan.remove_tags),"removed_tags":[],
        "retained_new_ghcr_revisions":[promoted,rollback],
        "revision_delete_attempted":False}
    if not apply:
        receipt["status"]="DRY_RUN"
        return receipt
    if plan.remove_tags:
        # Fresh source-of-truth snapshot before modifying any tagged URL.
        fresh,fresh_revs=snapshots(service)
        confirmed=plan_tags(service,fresh,fresh_revs,promoted,rollback)
        if confirmed!=plan or _tag_routes(fresh)!=_tag_routes(before) or (
                _serving(fresh)!=_serving(before)):
            raise Blocked("pre_tag_retirement_state_changed")
        subprocess.run(["gcloud","run","services","update-traffic",service,
            "--project="+PROJECT,"--region="+REGION,
            "--remove-tags="+",".join(plan.remove_tags),"--quiet"],
            capture_output=True,text=True,check=True)
        after,after_revs=snapshots(service)
        if _serving(after)!=_serving(before):
            raise Blocked("post_tag_retirement_formal_traffic_changed")
        expected={name:rev for name,rev in _tag_routes(before).items()
                  if name not in plan.remove_tags}
        if _tag_routes(after)!=expected:
            raise Blocked("post_tag_retirement_tag_readback_mismatch")
        # No prior GHCR tag/Revision may be sacrificed; ordinary retention
        # must now succeed before a separate Revision deletion stage.
        select_plan(service,after,after_revs,promoted,rollback)
        receipt["removed_tags"]=list(plan.remove_tags)
    receipt["status"]="PASS"
    return receipt


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service",choices=SERVICES,required=True)
    parser.add_argument("--promoted-revision",required=True)
    parser.add_argument("--rollback-revision",required=True)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    try:
        result=retire(args.service,args.promoted_revision,args.rollback_revision,args.apply)
    except (Blocked,subprocess.CalledProcessError,OSError,ValueError) as exc:
        # Never print gcloud stdout/stderr, sensitive request context or tokens.
        reason=str(exc) if isinstance(exc,Blocked) else type(exc).__name__
        print(json.dumps({"service":args.service,"status":"BLOCKED","reason":reason}))
        return 1
    print(json.dumps(result,sort_keys=True))
    return 0


if __name__=="__main__":
    sys.exit(main())
