#!/usr/bin/env python3
"""Read-only, per-tag 30-day Cloud Logging HTTP request activity evidence.

Absence of a matching request is NEVER evidence that a tagged endpoint is
unused, safe to retire, or not called by an external consumer. No URLs,
request bodies, auth headers, log messages or credentials appear in receipts.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

from cloudrun_revision_retention import PROJECT
from p0v_tag_dependency_audit import audit

LOOKBACK_DAYS = 30
TAGGED_HOST_SUFFIX = ".a.run.app"
MAX_COMMAND_SECONDS = 35

def tag_host(row: dict) -> str | None:
    # Only accept a Cloud Run-produced URL whose host is explicitly bound
    # to this same service's tag; never follow the URL or make an HTTP call.
    url = row.get("url", "")
    if not isinstance(url, str) or not url:
        return None
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.port is not None or parts.username or parts.password:
        return None
    host = parts.hostname or ""
    if not host.endswith(TAGGED_HOST_SUFFIX):
        return None
    if not host.startswith(row["tag"] + "---" + row["service"] + "-"):
        return None
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        return None
    return host

def latest_tag_request(service: str, host: str, start: str) -> dict:
    # Exact tag host presence in the requestUrl; Cloud Run logs may normalize
    # hosts or omit requests. Negative results remain explicitly inconclusive.
    prefix = "https://" + host + "/"
    filter_text = (
        'resource.type="cloud_run_revision" AND '
        'resource.labels.service_name="' + service + '" AND '
        'timestamp>="' + start + '" AND '
        'httpRequest.requestUrl:"' + prefix + '"'
    )
    args = ["gcloud", "logging", "read", filter_text,
            "--project=" + PROJECT, "--format=json", "--limit=1",
            "--order=desc"]
    try:
        proc = subprocess.run(args, capture_output=True, text=True,
                              timeout=MAX_COMMAND_SECONDS, check=False)
    except (OSError, subprocess.SubprocessError):
        return {"state": "LOGGING_UNAVAILABLE", "observed": None, "last_seen_utc": None}
    if proc.returncode:
        # Do not print sensitive CLI stderr; classify only stable safe categories.
        detail = (proc.stderr or "").lower()
        if any(term in detail for term in (
                "permission denied", "permission 'logging.logentries.list'",
                "does not have permission", "403 forbidden", "permission_denied")):
            reason = "LOGGING_PERMISSION_DENIED"
        elif any(term in detail for term in ("unrecognized arguments", "invalid filter",
                                            "invalid log filter", "invalid argument", "syntax error")):
            reason = "LOGGING_QUERY_INVALID"
        elif any(term in detail for term in ("api has not been used", "api is disabled",
                                            "logging.googleapis.com has not been used")):
            reason = "LOGGING_API_DISABLED"
        elif any(term in detail for term in ("authentication", "unauthorized", "401")):
            reason = "LOGGING_AUTH_UNAVAILABLE"
        else:
            reason = "LOGGING_OTHER_UNAVAILABLE"
        return {"state": reason, "observed": None, "last_seen_utc": None}
    try:
        events = json.loads(proc.stdout)
    except ValueError:
        return {"state": "LOGGING_UNAVAILABLE", "observed": None, "last_seen_utc": None}
    if not isinstance(events, list):
        return {"state": "LOGGING_UNAVAILABLE", "observed": None, "last_seen_utc": None}
    for event in events:
        if not isinstance(event, dict):
            continue
        request = event.get("httpRequest") or {}
        observed = urlsplit(str(request.get("requestUrl", ""))).hostname
        if observed != host:
            # The indexed substring may match text outside an exact tag host.
            continue
        time = event.get("timestamp")
        # Only timestamp returned; status/URL, user-agent, payload are discarded.
        if not isinstance(time, str):
            continue
        return {"state": "REQUEST_OBSERVED", "observed": True, "last_seen_utc": time}
    return {"state": "NOT_OBSERVED_NOT_PROOF_UNUSED",
            "observed": False, "last_seen_utc": None}

def inspect(rows: list[dict], now: datetime, check=latest_tag_request) -> dict:
    start = (now.astimezone(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()
    output = []
    # Persistent permission/query/API errors cannot be fixed by more reads.
    persistent_failure = None
    stop_states = {"LOGGING_PERMISSION_DENIED", "LOGGING_QUERY_INVALID",
                   "LOGGING_API_DISABLED", "LOGGING_AUTH_UNAVAILABLE"}
    for row in rows:
        host = tag_host(row)
        if not host:
            evidence = {"state": "TAG_URL_NOT_VERIFIABLE",
                        "observed": None, "last_seen_utc": None}
        elif persistent_failure is not None:
            evidence = persistent_failure
        else:
            evidence = check(row["service"], host, start)
            if evidence["state"] in stop_states:
                persistent_failure = evidence
        output.append({
            "service": row["service"], "tag": row["tag"],
            "revision": row["revision"], "classification": row["classification"],
            "omniagent_repo_reference_count": len(row["reference_files_in_omniagent_only"]),
            "activity": evidence["state"],
            "observed_request": evidence["observed"],
            "last_seen_utc": evidence["last_seen_utc"],
            "retirement_authorized": False,
            "safe_to_delete": False,
        })
    counts = {}
    for row in output:
        counts[row["activity"]] = counts.get(row["activity"], 0) + 1
    return {"status": "READ_ONLY_TELEMETRY_INVENTORY",
            "window_start_utc": start, "window_end_utc": now.astimezone(timezone.utc).isoformat(),
            "query": "one read-only recent request per exact tag host; indexed Cloud Logging",
            "limitations": [
                "Missing or truncated logs cannot prove a tag is unused.",
                "Requests may be routed via service/canonical URL instead of tagged URL.",
                "External consumer configuration, out-of-band links, and future usage not inspected.",
                "No tag or Revision deletion authorized by this receipt."
            ], "count": len(output), "activity_summary": counts, "tags": output,
            "tags_authorized_for_retirement": 0}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--receipt", required=True)
    args = p.parse_args()
    rows = audit()
    # The existing dependency inventory omits tag URL from its public result.
    # Rehydrate it solely within the bounded runner for logging queries.
    from p0v_safe_revision_cleanup import snapshot, tags
    sources = {}
    for service in sorted({row["service"] for row in rows}):
        snap, _ = snapshot(service)
        sources[service] = {label: url for _,_,label,url in tags(snap,service) if label}
    for row in rows:
        row["url"] = sources[row["service"]].get(row["tag"], "")
    result = inspect(rows, datetime.now(timezone.utc))
    Path(args.receipt).write_text(json.dumps(result, sort_keys=True, indent=2) + "\n")
    print("tag_activity_readonly=PASS counts="+json.dumps(result["activity_summary"], sort_keys=True))
    print("tag_retirements_authorized=ZERO no_traffic_or_tag_changes=PASS")

if __name__ == "__main__":
    main()
