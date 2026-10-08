#!/usr/bin/env python3
"""Fail-closed Cloud Run revision retention: keep the latest ten revisions.

Only call --apply AFTER real candidate acceptance, promotion, rollback rehearsal
and readback; normally through the release pipeline's last gated job.
Never touches GHCR images, Cloud Build, GCS, or Artifact Registry.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from dataclasses import dataclass

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
RETAIN_COUNT = 10  # Per service; neither GHCR packages nor runtime traffic are deleted.
SERVICES = (
    "omniagent-chat",
    "omniagent-agent-gateway",
    "omniagent-shared-codex",
)


class Blocked(ValueError):
    """No deletion is safe without stronger runtime evidence."""


@dataclass(frozen=True)
class RetentionPlan:
    keep: tuple[str, ...]
    delete: tuple[str, ...]


def _name(raw: object, service: str) -> str:
    if not isinstance(raw, str) or not re.fullmatch(r"[a-z][a-z0-9-]*", raw):
        raise Blocked("missing_or_invalid_revision_name")
    if not raw.startswith(service + "-"):
        raise Blocked("revision_outside_approved_service")
    return raw


def _date(value: object) -> dt.datetime:
    if not isinstance(value, str) or not value:
        raise Blocked("missing_revision_creation_timestamp")
    try:
        stamp = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            raise ValueError("timezone missing")
        return stamp
    except ValueError as exc:
        raise Blocked("invalid_revision_creation_timestamp") from exc


def select_plan(
    service: str,
    service_json: dict,
    revisions_json: list,
    promoted: str,
    rollback: str,
) -> RetentionPlan:
    """Return delete targets only if the newest ten preserve the live and rollback revisions."""
    if service not in SERVICES:
        raise Blocked("unknown_service")
    promoted = _name(promoted, service)
    rollback = _name(rollback, service)
    if promoted == rollback:
        raise Blocked("same_promoted_and_rollback")
    if not isinstance(service_json, dict) or not isinstance(revisions_json, list):
        raise Blocked("invalid_gcp_snapshot")

    records = []
    seen = set()
    for r in revisions_json:
        if not isinstance(r, dict):
            raise Blocked("invalid_revision_record")
        meta = r.get("metadata") or {}
        if not isinstance(meta, dict):
            raise Blocked("invalid_revision_metadata")
        revision = _name(meta.get("name") or r.get("name"), service)
        if revision in seen:
            raise Blocked("duplicate_revision_record")
        seen.add(revision)
        records.append((_date(meta.get("creationTimestamp") or r.get("createTime")), revision))
    if len(records) < 2:
        raise Blocked("rollback_revision_not_available")
    records.sort(reverse=True)
    retained = tuple(name for _, name in records[:RETAIN_COUNT])
    if retained[0] != promoted:
        raise Blocked("newest_revision_not_approved_promotion")
    # Failed or unaccepted candidate revisions may be newer than the last
    # healthy serving revision; protect the actual prior rollback target.
    if rollback not in retained:
        raise Blocked("rollback_revision_outside_latest_ten")

    status = service_json.get("status") or {}
    if not isinstance(status, dict):
        raise Blocked("invalid_service_status")
    created = status.get("latestCreatedRevisionName")
    ready = status.get("latestReadyRevisionName")
    if created != promoted or ready != promoted:
        raise Blocked("latest_revision_not_approved_and_ready")
    traffic = status.get("traffic")
    if not isinstance(traffic, list) or not traffic:
        raise Blocked("missing_traffic_readback")

    total = 0
    for entry in traffic:
        if not isinstance(entry, dict):
            raise Blocked("invalid_traffic_entry")
        rev = _name(entry.get("revisionName"), service)
        if rev not in seen:
            raise Blocked("traffic_refers_to_unknown_revision")
        amount = entry.get("percent", 0)
        if type(amount) is not int or amount < 0 or amount > 100:
            raise Blocked("invalid_traffic_percentage")
        total += amount
        if amount and rev != promoted:
            raise Blocked("traffic_on_non_promoted_revision")
        # Tags can still route explicit requests at 0% formal traffic.
        # Never remove a revision with a live tag outside the retained ten.
        if entry.get("tag") and rev not in retained:
            raise Blocked("older_revision_has_live_tag")
    if total != 100:
        raise Blocked("traffic_readback_not_100_percent")
    return RetentionPlan(retained, tuple(name for _, name in records[RETAIN_COUNT:]))


def gcloud_json(args: list[str]):
    cmd = ["gcloud", *args, "--project=" + PROJECT, "--region=" + REGION, "--format=json"]
    output = subprocess.run(cmd, text=True, capture_output=True, check=True)
    return json.loads(output.stdout)


def snapshots(service: str) -> tuple[dict, list]:
    metadata = gcloud_json(["run", "services", "describe", service])
    revisions = gcloud_json(["run", "revisions", "list", "--service=" + service])
    return metadata, revisions


def cleanup(service: str, promoted: str, rollback: str, apply: bool) -> dict:
    before, revisions = snapshots(service)
    plan = select_plan(service, before, revisions, promoted, rollback)
    receipt = {
        "service": service,
        "mode": "APPLY" if apply else "DRY_RUN",
        "retained": list(plan.keep),
        "planned_delete": list(plan.delete),
        "deleted": [],
    }
    if apply:
        for revision in plan.delete:
            # Re-read both API objects before each irreversible action.
            live, live_revs = snapshots(service)
            refreshed = select_plan(service, live, live_revs, promoted, rollback)
            if revision not in refreshed.delete:
                raise Blocked("pre_delete_state_changed")
            subprocess.run(
                [
                    "gcloud", "run", "revisions", "delete", revision,
                    "--project=" + PROJECT, "--region=" + REGION, "--quiet",
                ],
                check=True, text=True, capture_output=True,
            )
            receipt["deleted"].append(revision)
        after, remaining = snapshots(service)
        final_plan = select_plan(service, after, remaining, promoted, rollback)
        if final_plan.delete:
            raise Blocked("post_cleanup_more_than_ten_revisions")
        receipt["status"] = "PASS"
    else:
        receipt["status"] = "DRY_RUN"
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", required=True, choices=SERVICES)
    parser.add_argument("--promoted-revision", required=True)
    parser.add_argument("--rollback-revision", required=True)
    parser.add_argument("--apply", action="store_true", help="Delete safely; default is dry-run.")
    args = parser.parse_args()
    try:
        receipt = cleanup(
            args.service, args.promoted_revision, args.rollback_revision, args.apply
        )
    except (Blocked, subprocess.CalledProcessError, ValueError, OSError) as error:
        reason = str(error) if isinstance(error, Blocked) else type(error).__name__
        print(json.dumps({"service": args.service, "status": "BLOCKED", "reason": reason}))
        return 1  # Fail closed: never report success when safe retention cannot be guaranteed.
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
