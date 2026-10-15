#!/usr/bin/env python3
"""No-provider R01 candidate-only IAM caller minting preflight.

Never sends a Chat dispatch POST or makes database writes. It only checks
a strictly scoped existing 0%-traffic candidate and issues an ID token.
"""
import re
import sys
from r01_live_once import inspect_canary, must_http, choose_approved_token

def main():
    if len(sys.argv)!=2 or not re.fullmatch(r"[a-f0-9]{40}",sys.argv[1]):
        raise SystemExit("usage: r01_auth_preflight.py SOURCE_SHA")
    url,audience,approved,_,_=inspect_canary(sys.argv[1])
    must_http(url,"/ready",200)
    token=choose_approved_token(approved,audience)
    if token.count(".")!=2:
        raise RuntimeError("approved candidate-only caller token was invalid")
    print("r01_candidate_only_signed_caller=PASS_NO_PROVIDER_NO_DB_WRITE")

if __name__=="__main__":
    main()
