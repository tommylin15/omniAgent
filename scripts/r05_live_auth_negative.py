#!/usr/bin/env python3
"""R05 candidate Chat negative auth smoke. No valid user token or provider call.

Runs against the immutable GHCR 0%-traffic Chat revision for the exact source
SHA after signed smoke. It sends invalid credentials only, including malformed
non-mutating POST bodies. Never logs user tokens, UUIDs, prompts or data.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

SERVICE = "omniagent-chat"
PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"

def service():
    proc = subprocess.run(
        ["gcloud", "run", "services", "describe", SERVICE,
         "--project=" + PROJECT, "--region=" + REGION, "--format=json"],
        capture_output=True, text=True, timeout=60, check=False)
    if proc.returncode:
        raise RuntimeError("R05 service inventory unavailable")
    return json.loads(proc.stdout)

def live_traffic(doc):
    return {str(t.get("revisionName")): int(t.get("percent", 0))
            for t in ((doc.get("status") or {}).get("traffic") or [])
            if int(t.get("percent", 0)) > 0}

def candidate(doc, sha):
    traffic = (doc.get("status") or {}).get("traffic") or []
    active = live_traffic(doc)
    if len(active) != 1 or sum(active.values()) != 100:
        raise RuntimeError("R05 formal routing is unexpected")
    tag = "ghcr-" + sha[:12]
    found = [row for row in traffic
             if row.get("tag") == tag and row.get("percent", 0) == 0
             and str(row.get("revisionName", "")).startswith(SERVICE + "-")]
    if len(found) != 1:
        raise RuntimeError("R05 matching zero-traffic revision unavailable")
    origin = str(found[0].get("url") or "").rstrip("/")
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme != "https" or not re.fullmatch(
            r"[a-z0-9-]+\.a\.run\.app", parsed.hostname or "") or parsed.path:
        raise RuntimeError("R05 candidate URL is invalid")
    return origin, active

def http_status(url, method="GET", payload=None, headers=None):
    req = urllib.request.Request(url, method=method, data=payload,
                                 headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except urllib.error.URLError:
        raise RuntimeError("R05 negative auth endpoint unreachable") from None

def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"[0-9a-f]{40}", sys.argv[1]):
        raise RuntimeError("R05 exact source SHA required")
    origin, baseline = candidate(service(), sys.argv[1])
    if http_status(origin + "/health") != 200 or http_status(origin + "/ready") != 200:
        raise RuntimeError("R05 candidate health/readiness failure")
    # No valid OAuth token is acquired or used. A forged Owner header cannot
    # replace a Google-verified issuer/subject database mapping.
    forged = {"Authorization": "Bearer invalid.jwt.payload",
              "X-OmniAgent-Owner-Id": "00000000-0000-4000-8000-000000000099"}
    spoofed = {"Authorization": "Bearer fake", "Content-Type": "application/json",
               "X-OmniAgent-Owner-Id": "00000000-0000-4000-8000-000000000099"}
    bad_post = b'{"ownerId":"forged","runtime":"invalid"}'
    probes = [
        ("anonymous_models", "/v1/models", "GET", None, {}),
        ("anonymous_threads", "/v1/threads", "GET", None, {}),
        ("invalid_jwt_models", "/v1/models", "GET", None, forged),
        ("invalid_jwt_threads", "/v1/threads", "GET", None, forged),
        ("cross_owner_header_events", "/v1/threads/no-such-thread/events?cursor=-1",
         "GET", None, forged),
        ("invalid_user_thread_write", "/v1/threads", "POST", bad_post, spoofed),
        ("invalid_user_message_write", "/v1/threads/no-such-thread/messages",
         "POST", b'{"content":""}', spoofed),
        ("invalid_internal_service_identity",
         "/internal/v1/chat/reconciliation:candidates", "GET", None, forged),
    ]
    for label, path, method, body, headers in probes:
        status = http_status(origin + path, method, body, headers)
        if status != 401:
            raise RuntimeError("R05 invalid identity was not rejected: " + label)
        print("r05_" + label + "=PASS_401")
    if live_traffic(service()) != baseline:
        raise RuntimeError("R05 formal traffic changed")
    print("r05_live_candidate_invalid_user_auth=PASS")
    print("r05_formal_traffic_unchanged=PASS")
    print("r05_model_provider_calls=ZERO")
    print("r05_valid_two_user_oauth_e2e=NOT_VERIFIED_NO_DELEGATED_USER_TOKENS")

if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        # All error categories are constants with non-sensitive labels.
        print("r05_live_candidate_invalid_user_auth=BLOCKED")
        print("r05_failure_type=" + type(err).__name__)
        sys.exit(1)
