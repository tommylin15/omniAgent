#!/usr/bin/env python3
"""Guarded fixed Cloud Run Chat preview tag publication.

Readiness and signed candidate Smoke must pass before this is called. This
module cannot promote formal traffic, run providers, or modify any other tag.
Preview publication is opt-in and is not a substitute for application release.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
SERVICE = "omniagent-chat"
ORIGIN = "https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app"
REPO = "https://github.com/tommylin15/omniAgent.git"
HEALTH_PATHS = ("/health", "/ready", "/", "/main.dart.js")
DENIAL_PATHS = ("/v1/threads", "/internal/v1/chat/dispatch:once")


class Blocked(ValueError):
    """Safety invariant failed; no acceptance is implied."""


def command(*args: str) -> str:
    result = subprocess.run(args, check=True, text=True, capture_output=True, timeout=90)
    return result.stdout


def service() -> dict:
    return json.loads(command("gcloud", "run", "services", "describe", SERVICE,
                              "--project=" + PROJECT, "--region=" + REGION,
                              "--format=json"))


def revision(name: str) -> dict:
    if not re.fullmatch(r"omniagent-chat-[a-z0-9-]{6,80}", name):
        raise Blocked("invalid_revision_name")
    return json.loads(command("gcloud", "run", "revisions", "describe", name,
                              "--project=" + PROJECT, "--region=" + REGION,
                              "--format=json"))


def assert_current_sha(sha: str) -> None:
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise Blocked("invalid_release_sha")
    result = command("git", "ls-remote", REPO, "refs/heads/main").split()
    if not result or result[0] != sha:
        raise Blocked("stale_main_sha")


def routes(doc: dict) -> list[dict]:
    entries = (doc.get("status") or {}).get("traffic")
    if not isinstance(entries, list) or not entries:
        raise Blocked("missing_traffic_snapshot")
    for row in entries:
        if not isinstance(row, dict) or not isinstance(row.get("revisionName"), str):
            raise Blocked("invalid_traffic_entry")
        if type(row.get("percent", 0)) is not int:
            raise Blocked("invalid_traffic_percent")
    return entries


def tag_revision(doc: dict, tag: str) -> str | None:
    items = [r for r in routes(doc) if r.get("tag") == tag]
    if len(items) > 1:
        raise Blocked("duplicate_tag_" + tag)
    return items[0]["revisionName"] if items else None


def traffic_fingerprint(doc: dict) -> tuple:
    """Capture only formal percentages, never change or infer formal routing."""
    entries = [(r["revisionName"], r.get("percent", 0)) for r in routes(doc)
               if r.get("percent", 0) > 0]
    if len(entries) != 1 or entries[0][1] != 100:
        raise Blocked("formal_traffic_not_single_100")
    return tuple(entries)


def other_tags(doc: dict) -> tuple:
    return tuple(sorted((r["tag"], r["revisionName"])
                        for r in routes(doc) if r.get("tag") and r["tag"] != "preview"))


def config_fingerprint(doc: dict) -> str:
    spec = dict(doc.get("spec") or {})
    spec.pop("traffic", None)
    annotations = (doc.get("metadata") or {}).get("annotations") or {}
    # Exclude only tool-generated attribution annotations; ingress, VPC,
    # OAuth and service/template security settings are preserved.
    protected = {k: v for k, v in annotations.items()
                 if not k.startswith("client.knative.dev/")}
    return json.dumps({"spec": spec, "annotations": protected}, sort_keys=True)


def verify_preserved(before: dict, after: dict) -> None:
    if (traffic_fingerprint(before) != traffic_fingerprint(after)
            or other_tags(before) != other_tags(after)
            or config_fingerprint(before) != config_fingerprint(after)):
        raise Blocked("traffic_tags_or_config_changed")


def verify_candidate(doc: dict, sha: str, target: str, serving: str, digest: str) -> None:
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise Blocked("invalid_immutable_digest")
    if traffic_fingerprint(doc) != ((serving, 100),):
        raise Blocked("serving_revision_drift")
    status = doc.get("status") or {}
    if status.get("latestReadyRevisionName") != target or status.get("latestCreatedRevisionName") != target:
        raise Blocked("latest_candidate_not_ready")
    candidate_tag = "ghcr-" + sha[:12]
    candidates = [r for r in routes(doc) if r.get("tag") == candidate_tag
                  and r["revisionName"] == target and r.get("percent", 0) == 0]
    if len(candidates) != 1:
        raise Blocked("candidate_tag_or_zero_percent_mismatch")
    spec = (((doc.get("spec") or {}).get("template") or {}).get("spec") or {})
    containers = spec.get("containers") or []
    if (len(containers) != 1 or
            containers[0].get("image") != "ghcr.io/tommylin15/omniagent-chat@" + digest):
        raise Blocked("candidate_image_digest_mismatch")


def preview_points_to(doc: dict, expected: str | None) -> None:
    actual = tag_revision(doc, "preview")
    if actual != expected:
        raise Blocked("preview_revision_mismatch")
    if expected:
        urls = [r.get("url", "").rstrip("/") for r in routes(doc)
                if r.get("tag") == "preview"]
        if urls != [ORIGIN]:
            raise Blocked("fixed_preview_url_mismatch")


def verify_http(origin: str = ORIGIN, attempts: int = 4) -> None:
    for attempt in range(attempts):
        try:
            for path in HEALTH_PATHS + DENIAL_PATHS:
                method = "POST" if path.endswith("dispatch:once") else "GET"
                request = urllib.request.Request(
                    origin + path, method=method,
                    headers={"Content-Type": "application/json"} if method == "POST" else {},
                    data=b"{}" if method == "POST" else None)
                try:
                    with urllib.request.urlopen(request, timeout=25) as response:
                        code = response.status
                except urllib.error.HTTPError as exc:
                    code = exc.code
                desired = 401 if path in DENIAL_PATHS else 200
                if code != desired:
                    raise Blocked("preview_http_" + path.strip("/").replace("/", "_") + "_unexpected")
            return
        except (Blocked, urllib.error.URLError, TimeoutError, OSError):
            if attempt == attempts - 1:
                raise Blocked("preview_http_validation_failed")
            time.sleep(2)


def change_preview(target: str | None) -> None:
    flag = ("--update-tags=preview=" + target) if target else "--remove-tags=preview"
    command("gcloud", "run", "services", "update-traffic", SERVICE,
            "--project=" + PROJECT, "--region=" + REGION, flag, "--quiet")


def report(path: str, receipt: dict) -> None:
    safe = json.dumps(receipt, sort_keys=True, ensure_ascii=False, indent=2)
    Path(path).write_text(safe + "\n", encoding="utf-8")
    summary = __import__("os").environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fd:
            fd.write("### Fixed preview publication\n\n")
            fd.write("| Field | Result |\n| --- | --- |\n")
            for key, value in receipt.items():
                if isinstance(value, (str, int)) or value is None:
                    fd.write(f"| {key} | {str(value).replace('|', '/')} |\n")
            fd.write("\n")


def publish(sha: str, target: str, serving: str, digest: str, apply: bool) -> dict:
    receipt = {"source_sha": sha, "target_revision": target,
               "fixed_preview": ORIGIN, "formal_traffic": "UNTOUCHED",
               "preview_before": None, "preview_after": None,
               "recovery": "NOT_NEEDED", "status": "BLOCKED"}
    attempted = False
    before = None
    try:
        assert_current_sha(sha)
        before = service()
        verify_candidate(before, sha, target, serving, digest)
        old = tag_revision(before, "preview")
        receipt["preview_before"] = old
        if old:
            revision(old)  # Reject missing/deleted previous route.
            preview_points_to(before, old)
            verify_http()  # Previous revision is a verified recovery endpoint.
        if not apply:
            receipt["preview_after"] = old
            receipt["status"] = "DRY_RUN"
            return receipt

        assert_current_sha(sha)
        fresh = service()
        verify_preserved(before, fresh)
        verify_candidate(fresh, sha, target, serving, digest)
        preview_points_to(fresh, old)
        if old != target:
            attempted = True
            change_preview(target)
        updated = service()
        verify_preserved(before, updated)
        verify_candidate(updated, sha, target, serving, digest)
        preview_points_to(updated, target)
        verify_http()
        assert_current_sha(sha)
        receipt["preview_after"] = target
        receipt["status"] = "PASS"
        return receipt
    except Exception as exc:
        receipt["reason"] = str(exc) if isinstance(exc, Blocked) else type(exc).__name__
        if attempted and before is not None:
            try:
                current = service()
                verify_preserved(before, current)
                original = receipt["preview_before"]
                pointing = tag_revision(current, "preview")
                if pointing == target:
                    change_preview(original)
                    restored = service()
                    verify_preserved(before, restored)
                    preview_points_to(restored, original)
                    if original:
                        verify_http()
                    receipt["recovery"] = "PASS"
                    receipt["preview_after"] = original
                elif pointing == original:
                    receipt["recovery"] = "NO_CHANGE"
                    receipt["preview_after"] = original
                else:
                    receipt["recovery"] = "BLOCKED"
                    receipt["preview_after"] = "UNKNOWN"
            except Exception:
                receipt["recovery"] = "FAIL"
                receipt["preview_after"] = "UNKNOWN"
        receipt["status"] = "FAIL" if attempted else "BLOCKED"
        return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-sha", required=True)
    parser.add_argument("--target-revision", required=True)
    parser.add_argument("--serving-revision", required=True)
    parser.add_argument("--image-digest", required=True)
    parser.add_argument("--report-file", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    result = publish(args.release_sha, args.target_revision,
                     args.serving_revision, args.image_digest, args.apply)
    report(args.report_file, result)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if result["status"] in ("PASS", "DRY_RUN") else 1


if __name__ == "__main__":
    sys.exit(main())
