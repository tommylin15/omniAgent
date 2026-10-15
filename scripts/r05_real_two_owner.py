#!/usr/bin/env python3
"""R05 genuine two-Google-user OAuth boundary on immutable 0%-traffic Chat.

Only legitimate Google ID tokens issued for the deployed browser OAuth client
can pass the real Cloud Run verifier. Tokens arrive from GitHub masked secrets,
never from synthetic user headers, service-account OIDC or checked-in fixtures.
No provider call, message POST, user message readback, or secret logging.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
SERVICE = "omniagent-chat"
MODEL = "gemini-3.5-flash-lite"
UUID = re.compile(r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$", re.I)


class Blocked(RuntimeError):
    pass


def inventory(source_sha):
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise Blocked("INVALID_SOURCE_SHA")
    result = subprocess.run(
        ["gcloud", "run", "services", "describe", SERVICE,
         "--project=" + PROJECT, "--region=" + REGION, "--format=json"],
        check=True, capture_output=True, text=True, timeout=75)
    svc = json.loads(result.stdout)
    traffic = (svc.get("status") or {}).get("traffic") or []
    serving = [t for t in traffic if int(t.get("percent") or 0) > 0]
    if len(serving) != 1 or serving[0].get("percent") != 100:
        raise Blocked("FORMAL_ROUTING_NOT_STABLE")
    matching = [t for t in traffic
                if t.get("tag") == "ghcr-" + source_sha[:12]
                and t.get("percent") == 0 and t.get("revisionName")
                and t.get("url")]
    if len(matching) != 1:
        raise Blocked("EXACT_SHA_ZERO_TRAFFIC_CANDIDATE_MISSING")
    candidate = matching[0]
    origin = str(candidate["url"]).rstrip("/")
    parsed = urllib.parse.urlsplit(origin)
    if (parsed.scheme != "https" or
            not re.fullmatch(r"[a-z0-9-]+\.a\.run\.app", parsed.hostname or "") or
            parsed.port is not None or parsed.username or parsed.password or
            parsed.path or parsed.query or parsed.fragment):
        raise Blocked("CANDIDATE_URL_INVALID")
    revision = str(candidate["revisionName"])
    result = subprocess.run(
        ["gcloud", "run", "revisions", "describe", revision,
         "--project=" + PROJECT, "--region=" + REGION, "--format=json"],
        check=True, capture_output=True, text=True, timeout=75)
    cfg = json.loads(result.stdout)
    containers = (cfg.get("spec") or {}).get("containers") or []
    if len(containers) != 1:
        raise Blocked("CANDIDATE_CONFIG_INVALID")
    env = {row.get("name"): row for row in containers[0].get("env") or []}
    if (env.get("CHAT_DISPATCH_ENABLED") or {}).get("value") == "true":
        raise Blocked("REFUSE_ENABLED_MODEL_DISPATCH")
    if (env.get("CHAT_BYOK_MANAGEMENT_ENABLED") or {}).get("value") == "true":
        raise Blocked("REFUSE_ENABLED_BYOK")
    if not env.get("OMNIAGENT_GOOGLE_CLIENT_ID"):
        raise Blocked("OAUTH_AUDIENCE_NOT_CONFIGURED")
    return origin, {str(t.get("revisionName")): int(t.get("percent") or 0)
                    for t in serving}


def call(origin, token, method, path, payload=None, spoof_owner=None):
    # Paths and origin are fixed by the program; no token in the URL.
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Idempotency-Key"] = str(uuid4())
    if spoof_owner is not None:
        headers["X-OmniAgent-Owner-Id"] = spoof_owner
    request = urllib.request.Request(
        origin + path, method=method, headers=headers,
        data=None if payload is None else json.dumps(payload).encode("utf-8"))
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            data = response.read(1_000_000)
            return response.status, (json.loads(data) if data and
                                     response.headers.get("Content-Type", "").startswith(
                                         "application/json") else None)
    except urllib.error.HTTPError as exc:
        # No remote error body, token or personal data is logged or returned.
        return exc.code, None
    except Exception:
        raise Blocked("AUTH_ENDPOINT_UNREACHABLE") from None


def need(actual, expected, label):
    if actual != expected:
        raise Blocked(label)


def exercise(origin, token_a, token_b, request=call):
    if not token_a or not token_b or token_a == token_b:
        raise Blocked("TWO_DISTINCT_DELEGATED_USER_TOKENS_REQUIRED")
    users = []
    for token in (token_a, token_b):
        status, data = request(origin, token, "GET", "/v1/me")
        if status != 200 or not isinstance(data, dict) or not UUID.fullmatch(
                str(data.get("ownerId") or "")):
            raise Blocked("OAUTH_INVALID_EXPIRED_OR_WRONG_AUDIENCE")
        users.append(str(data["ownerId"]))
    if users[0] == users[1]:
        raise Blocked("GOOGLE_USERS_MAP_TO_SAME_OWNER")
    print("r05_two_valid_user_id_tokens=PASS_VERIFIED_BY_CHAT")
    print("r05_distinct_db_owner_mappings=PASS")

    # No model or user message is created. Only disposable, uniquely named
    # test threads are inserted and removed; cross-owner deletes MUST 404.
    created = {}
    cleanup_failed = False
    try:
        for n, token in enumerate((token_a, token_b)):
            thread_id = "r05-" + str(uuid4())
            status, data = request(origin, token, "POST", "/v1/threads", {
                "runtime": "gemini", "model": MODEL,
                "assistantProfile": "default", "threadId": thread_id,
            })
            if status != 201 or not isinstance(data, dict) or data.get(
                    "thread_id") != thread_id or data.get("owner_id") != users[n]:
                raise Blocked("OWNED_TEST_THREAD_CREATE_FAILED")
            created[n] = thread_id
        for n in (0, 1):
            own_token = (token_a, token_b)[n]
            other_token = (token_b, token_a)[n]
            thread_id = created[n]
            base = "/v1/threads/" + thread_id
            status, body = request(origin, own_token, "GET", base,
                                   spoof_owner=users[1-n])
            need(status, 200, "OWN_READ_FAILED")
            if not isinstance(body, dict) or body.get("owner_id") != users[n]:
                raise Blocked("OWNER_HEADER_SPOOFED_POSITIVE_READ")
            for path in (base, base + "/events?cursor=-1",
                         base + "/turns/active", base + "/turns/latest"):
                status, _ = request(origin, other_token, "GET", path,
                                    spoof_owner=users[n])
                need(status, 404, "CROSS_OWNER_READ_NOT_DENIED")
            status, _ = request(origin, other_token, "DELETE", base,
                                spoof_owner=users[n])
            need(status, 404, "CROSS_OWNER_DELETE_NOT_DENIED")
            status, _ = request(origin, own_token, "GET", base)
            need(status, 200, "OWN_THREAD_MODIFIED_BY_FOREIGN_OWNER")
        print("r05_two_owner_positive_thread_crud=PASS")
        print("r05_cross_owner_thread_sse_active_latest_delete=PASS")
        print("r05_header_spoof_resistance=PASS")
    finally:
        for n, thread_id in created.items():
            token = (token_a, token_b)[n]
            try:
                status, _ = request(origin, token, "DELETE",
                                    "/v1/threads/" + thread_id)
                if status != 200:
                    cleanup_failed = True
            except Exception:
                cleanup_failed = True
        if cleanup_failed:
            # Avoid claiming a clean result if the ephemeral test objects
            # remain. Identifiers are deliberately not printed in public logs.
            raise Blocked("TEST_THREAD_CLEANUP_NOT_CONFIRMED")
    print("r05_disposable_thread_cleanup=PASS")
    print("r05_provider_execution=ZERO_NO_MESSAGE_POST")
    print("r05_turn_receipt_and_codex_session=NOT_TESTED_BY_THIS_BOUNDARY")
    return True


def main():
    if len(sys.argv) != 2:
        raise Blocked("EXACT_SOURCE_SHA_REQUIRED")
    token_a = os.environ.get("R05_OWNER_A_GOOGLE_ID_TOKEN", "").strip()
    token_b = os.environ.get("R05_OWNER_B_GOOGLE_ID_TOKEN", "").strip()
    if not token_a or not token_b:
        raise Blocked("NO_TWO_DELEGATED_GOOGLE_USER_TOKENS_CONFIGURED")
    origin, baseline = inventory(sys.argv[1])
    try:
        exercise(origin, token_a, token_b)
    finally:
        _, after = inventory(sys.argv[1])
        if after != baseline:
            raise Blocked("FORMAL_TRAFFIC_CHANGED")
    print("r05_formal_traffic_unchanged=PASS")
    print("r05_two_user_live_auth_boundary=PASS")


if __name__ == "__main__":
    try:
        main()
    except Blocked as exc:
        # This is a mandatory gate: if required legal user identities are
        # missing, a GREEN CI job must never masquerade as a live E2E PASS.
        print("r05_two_user_live_auth_boundary=NOT_VERIFIED")
        print("r05_blocker=" + str(exc))
        sys.exit(1)
    except Exception:
        print("r05_two_user_live_auth_boundary=NOT_VERIFIED")
        print("r05_blocker=UNCLASSIFIED_OR_RUNTIME_FAILURE")
        sys.exit(1)
