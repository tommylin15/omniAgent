#!/usr/bin/env python3
"""One-shot GHCR Cloud Run promotion, without an optional rollback rehearsal.

This is NOT live owner/provider approval. Chat dispatch and BYOK remain disabled.
Emergency restoration on *failed promotion* is not a rehearsal. Never clean
revisions from this script.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

from ghcr_release_readiness import (
    Blocked, PROJECT, REGION, SERVICES, SHA, FALLBACK_SHA,
    audit, current_sha, gcloud, one, live, run, failure_category,
)

PROMOTE_ORDER = ("omniagent-shared-codex", "omniagent-agent-gateway", "omniagent-chat")


def plan(source_sha: str, services: dict, report: dict) -> dict:
    if report.get("sha") != source_sha or report.get("technical_preflight") != "PASS":
        raise Blocked("technical_readiness_not_passed")
    steps = []
    for svc in PROMOTE_ORDER:
        status = (services.get(svc) or {}).get("status") or {}
        routes = status.get("traffic") or []
        before = live(routes)
        candidate = one(routes, tag="ghcr-" + source_sha[:12])["revisionName"]
        if before != report["services"][svc]["formal_revision_untouched"]:
            raise Blocked("pre_promotion_serving_revision_changed")
        if candidate != report["services"][svc]["candidate_revision"]:
            raise Blocked("pre_promotion_candidate_changed")
        if status.get("latestReadyRevisionName") != candidate:
            raise Blocked("pre_promotion_candidate_not_latest_ready")
        steps.append({"service": svc, "before": before,
                      "candidate": candidate,
                      "fallback": report["services"][svc]["fallback_revision"],
                      "source_image_digest": report["services"][svc]["source_image_digest"]})
    return {"sha": source_sha, "scope": "no_paid_provider_or_byok_activation",
            "rollback_rehearsal": "WAIVED_BY_OWNER",
            "steps": steps}


def traffic(service: str, revision: str) -> None:
    subprocess.run(["gcloud", "run", "services", "update-traffic", service,
                    "--to-revisions=" + revision + "=100",
                    "--project=" + PROJECT, "--region=" + REGION, "--quiet"],
                   check=True, capture_output=True, text=True, timeout=120)


def verify_all(steps: list[dict], switched: set[str]) -> None:
    for step in steps:
        svc = step["service"]
        snapshot = gcloud("services", svc)
        expected = step["candidate"] if svc in switched else step["before"]
        if live((snapshot.get("status") or {}).get("traffic") or []) != expected:
            raise Blocked("concurrent_traffic_change_" + svc)
        if (snapshot.get("status") or {}).get("latestReadyRevisionName") != step["candidate"]:
            raise Blocked("newer_candidate_or_ready_state_changed_" + svc)
        template = ((snapshot.get("spec") or {}).get("template") or {}).get("spec") or {}
        images = [r.get("image") for r in template.get("containers") or []]
        expected_image = "ghcr.io/tommylin15/" + svc + "@" + step["source_image_digest"]
        if images != [expected_image]:
            raise Blocked("candidate_image_changed_" + svc)


def receipt(path: str, data: dict) -> None:
    Path(path).write_text(json.dumps(data, sort_keys=True, indent=2) + "\n")


def promote(source_sha: str, path: str, apply: bool) -> int:
    data = {"sha": source_sha, "status": "BLOCKED",
            "traffic_mutation_attempted": False,
            "emergency_recovery": "NOT_NEEDED",
            "rollback_rehearsal": "WAIVED_BY_OWNER"}
    changed = []
    steps: list[dict] = []
    try:
        if current_sha() != source_sha:
            raise Blocked("stale_main")
        services = {svc: gcloud("services", svc) for svc in SERVICES}
        revisions = {}
        for svc, obj in services.items():
            for tag in ("ghcr-" + source_sha[:12], "ghcr-" + FALLBACK_SHA[:12]):
                rev = one((obj.get("status") or {}).get("traffic") or [], tag=tag)
                revisions[rev["revisionName"]] = gcloud("revisions", rev["revisionName"])

        def secret_state(name: str, version: str) -> str:
            return run("gcloud", "secrets", "versions", "describe", version,
                       "--secret=" + name, "--project=" + PROJECT,
                       "--format=value(state)").strip()

        report = audit(source_sha, services, revisions, secret_state)
        p = plan(source_sha, services, report)
        steps = p["steps"]
        data.update(p)
        data["status"] = "DRY_RUN"
        receipt(path, data)
        if not apply:
            return 0
        for step in steps:
            verify_all(steps, set(changed))
            data["traffic_mutation_attempted"] = True
            # Include the in-flight service for emergency recovery if gcloud
            # returns an error after having made the routing mutation.
            changed.append(step["service"])
            traffic(step["service"], step["candidate"])
            for attempt in range(12):
                try:
                    verify_all(steps, set(changed))
                    break
                except Blocked:
                    if attempt == 11:
                        raise
                    time.sleep(2)
        verify_all(steps, set(changed))
        data["status"] = "PASS"
        data["emergency_recovery"] = "NOT_NEEDED"
        receipt(path, data)
        print("one_shot_ghcr_traffic_promotion=PASS")
        return 0
    except (Blocked, subprocess.SubprocessError, ValueError, KeyError, OSError) as error:
        data["status"] = "BLOCKED"
        data["reason"] = failure_category(error)
        if changed:
            restored = []
            failures = []
            by_service = {s["service"]: s for s in steps}
            for svc in reversed(changed):
                try:
                    traffic(svc, by_service[svc]["before"])
                    if live((gcloud("services", svc).get("status") or {}).get("traffic") or []) != by_service[svc]["before"]:
                        raise Blocked("emergency_restore_readback_failed")
                    restored.append(svc)
                except (Blocked, subprocess.SubprocessError, ValueError, KeyError, OSError):
                    failures.append(svc)
            data["emergency_recovery"] = "FAILED" if failures else "PASS"
            data["emergency_recovered_services"] = restored
            data["emergency_recovery_failed_services"] = failures
        receipt(path, data)
        print("one_shot_ghcr_traffic_promotion=BLOCKED")
        print("category=" + data["reason"])
        return 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-sha", required=True)
    parser.add_argument("--report-file", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    if not SHA.fullmatch(args.release_sha):
        print("invalid_release_sha")
        return 2
    return promote(args.release_sha, args.report_file, args.apply)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
