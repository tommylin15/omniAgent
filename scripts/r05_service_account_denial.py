#!/usr/bin/env python3
"""R05 live Google-signed service-account token MUST be rejected by Chat user auth.

Uses a narrowly IAM-issued SA ID token with the *public browser client ID*
as audience against only exact-SHA 0%-traffic Chat candidate.
Not a substitute for two real Google user tokens. No model execution.
"""
import base64
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

import r05_live_auth_negative as live

SERVICE_PRINCIPAL = "omniagent-codex-chat-client@" + live.PROJECT + ".iam.gserviceaccount.com"


def revision_client_id(sha, doc):
    tag = "ghcr-" + sha[:12]
    rows = [row for row in (doc.get("status") or {}).get("traffic") or []
            if row.get("tag") == tag and row.get("percent", 0) == 0]
    if len(rows) != 1 or not rows[0].get("revisionName"):
        raise RuntimeError("R05 exact candidate missing")
    p = subprocess.run(
        ["gcloud", "run", "revisions", "describe", str(rows[0]["revisionName"]),
         "--project=" + live.PROJECT, "--region=" + live.REGION, "--format=json"],
        capture_output=True, text=True, check=True, timeout=75)
    rev = json.loads(p.stdout)
    containers = (rev.get("spec") or {}).get("containers") or []
    if len(containers) != 1:
        raise RuntimeError("R05 candidate container invalid")
    env = {x.get("name"): x for x in containers[0].get("env") or []}
    if (env.get("CHAT_DISPATCH_ENABLED") or {}).get("value") == "true" or (
            env.get("CHAT_BYOK_MANAGEMENT_ENABLED") or {}).get("value") == "true":
        raise RuntimeError("R05 protected features unexpectedly enabled")
    audience = (env.get("OMNIAGENT_GOOGLE_CLIENT_ID") or {}).get("value")
    if not isinstance(audience, str) or not re.fullmatch(
            r"[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", audience):
        raise RuntimeError("R05 configured OAuth client audience unavailable")
    return audience


def issue_google_signed_sa_identity(audience):
    # CI is permitted IAMCredentials:getOpenIdToken for this scoped service
    # account by the existing signed Cloud Run smoke; no broad impersonation.
    p = subprocess.run(["gcloud", "auth", "print-access-token"],
                       check=True, capture_output=True, text=True, timeout=40)
    access = p.stdout.strip()
    if not access:
        raise RuntimeError("R05 GitHub WIF access unavailable")
    account = urllib.parse.quote(SERVICE_PRINCIPAL, safe="")
    request = urllib.request.Request(
        "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
        account + ":generateIdToken",
        data=json.dumps({"audience": audience, "includeEmail": True}).encode(),
        headers={"Authorization": "Bearer " + access,
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=40) as resp:
            token = json.load(resp).get("token")
    except Exception:
        raise RuntimeError("R05 scoped IAM signed token unavailable") from None
    if not isinstance(token, str) or len(token.split(".")) != 3:
        raise RuntimeError("R05 signed token invalid")
    # These checks are purely smoke guardrails on the known IAM caller.
    # The real Chat backend, not this unverified decode, verifies signature.
    try:
        claims_part = token.split(".")[1]
        decoded = base64.urlsafe_b64decode(
            claims_part + "=" * (-len(claims_part) % 4))
        claims = json.loads(decoded)
    except Exception:
        raise RuntimeError("R05 signed token claims unavailable") from None
    if (claims.get("iss") not in ("accounts.google.com",
                                 "https://accounts.google.com") or
            claims.get("aud") != audience or
            str(claims.get("email", "")).lower() != SERVICE_PRINCIPAL.lower() or
            claims.get("email_verified") is not True or
            not re.fullmatch(r"[0-9]+", str(claims.get("azp") or ""))):
        raise RuntimeError("R05 minted token is not expected service principal")
    return token


def deny(origin, token, call=live.http_status):
    for label, path in (
        ("me", "/v1/me"),
        ("models", "/v1/models"),
        ("threads", "/v1/threads"),
        ("events", "/v1/threads/r05-unavailable/events?cursor=-1"),
        ("latest", "/v1/threads/r05-unavailable/turns/latest"),
    ):
        status = call(origin + path, headers={"Authorization": "Bearer " + token})
        if status != 401:
            raise RuntimeError("R05 signed service identity accessed user endpoint")
        print("r05_signed_sa_user_" + label + "=PASS_401")


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"[a-f0-9]{40}", sys.argv[1]):
        raise RuntimeError("R05 exact source SHA required")
    sha = sys.argv[1]
    before = live.service()
    origin, traffic = live.candidate(before, sha)
    audience = revision_client_id(sha, before)
    sa_jwt = issue_google_signed_sa_identity(audience)
    # Signing / minted token is genuine IAM, not a fake locally signed JWT.
    # No response content, bearer value or Google user ID is printed.
    deny(origin, sa_jwt)
    if live.live_traffic(live.service()) != traffic:
        raise RuntimeError("R05 formal traffic changed")
    print("r05_signed_sa_user_boundary=PASS")
    print("r05_no_model_inference=PASS")
    print("r05_real_two_google_users=NOT_VERIFIED_NO_DELEGATED_USER_TOKENS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("r05_signed_sa_user_boundary=BLOCKED")
        print("r05_blocker_class=" + type(exc).__name__)
        sys.exit(1)
