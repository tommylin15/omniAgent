#!/usr/bin/env python3
"""One-shot no-traffic R01 Gemini Chat TLS canary. Never calls a model.
The public DB server certificate and approved DB Owner are supplied at
runtime; neither is embedded in the repository or in the JSON receipt.
"""
import base64
import hashlib
import json
import os
import re
import ssl
import subprocess
import sys
from pathlib import Path
from p0_owner_trial_stage import (OWNER_DIGEST,PROJECT,REGION,describe,env,template,
    tagged,serving,image_for,annotation_max,launch,restore)

MODEL="gemini-3.5-flash-lite"
TLS_SERVERNAME=base64.b64decode("amFudXMtcG9zdGdyZXMtZGV2").decode("ascii")
SETTINGS=("CHAT_DISPATCH_APPROVED_OWNER_IDS","CHAT_DISPATCH_ENTITLEMENTS_JSON",
    "CHAT_GATEWAY_URL","CHAT_GATEWAY_AUDIENCE","CHAT_DISPATCH_BUDGET_JSON",
    "CHAT_DATABASE_CA_BASE64","CHAT_DATABASE_TLS_SERVERNAME")
def check_public_cert(base64_cert):
    if not isinstance(base64_cert,str) or len(base64_cert)>24000:
        raise ValueError("public trust anchor invalid")
    pem=base64.b64decode(base64_cert,validate=True).decode("utf-8")
    if not pem.startswith("-----BEGIN CERTIFICATE-----"):
        raise ValueError("invalid public trust anchor")
    der=ssl.PEM_cert_to_DER_cert(pem)
    if len(der)<200:
        raise ValueError("invalid public trust anchor")
    # Both chain trust and name matching are also checked by Node's
    # TLS stack on GET /ready; never disable certificate verification.
    return hashlib.sha256(der).hexdigest()

def main():
    if len(sys.argv)!=4: raise SystemExit("usage: r01_tls_canary.py SHA PUBLIC_DB_METADATA_JSON REDACTED_REPORT_JSON")
    sha,private,output=sys.argv[1:]
    if not re.fullmatch(r"[a-f0-9]{40}",sha):
        raise RuntimeError("source SHA invalid")
    meta=json.loads(Path(private).read_text())
    owner=meta.get("owner_id")
    if not isinstance(owner,str) or hashlib.sha256(owner.encode()).hexdigest()!=OWNER_DIGEST:
        raise RuntimeError("Owner is not the approved DB-backed identity")
    base64_cert=meta.get("certificate_base64")
    fingerprint=check_public_cert(base64_cert)
    chat="omniagent-chat"; gateway="omniagent-agent-gateway"
    before={svc:describe(svc) for svc in (chat,gateway)}
    for svc,doc in before.items():
        if len(serving(doc))!=1 or sum(serving(doc).values())!=100:
            raise RuntimeError("formal traffic allocation is not safely understood")
        tagged(doc,"ghcr-"+sha[:12])
    chat_env=env(before[chat])
    if (chat_env.get("CHAT_DISPATCH_ENABLED") or {}).get("value") not in ("false",None):
        raise RuntimeError("Chat dispatch already enabled in live service template")
    if (chat_env.get("CHAT_DATABASE_TLS_MODE") or {}).get("value")!="private-self-signed":
        raise RuntimeError("unexpected active TLS mode")
    if any(key in chat_env for key in SETTINGS):
        raise RuntimeError("stale Owner trial settings are present")
    if "OMNIAGENT_BUNDLE" not in chat_env:
        raise RuntimeError("missing existing Chat signed storage bundle")
    if (chat_env.get("CHAT_BYOK_MANAGEMENT_ENABLED") or {}).get("value")=="true":
        raise RuntimeError("BYOK unexpectedly active")
    gateway_doc=before[gateway]
    if "OMNIAGENT_PROVIDER_BUNDLE" not in env(gateway_doc):
        raise RuntimeError("Gateway signed provider bundle missing")
    gate_url=tagged(gateway_doc,"ghcr-"+sha[:12])["url"].rstrip("/")
    audience=str((gateway_doc.get("status") or {}).get("url") or "").rstrip("/")
    if not audience.startswith("https://") or not gate_url.startswith("https://"):
        raise RuntimeError("private signed Gateway route unavailable")
    image=image_for(chat,before[chat],tagged(before[chat],"ghcr-"+sha[:12])["revisionName"])
    max_instances=annotation_max(before[chat])
    entitlements=json.dumps([{"ownerId":owner,"runtime":"gemini",
        "model":MODEL,"credentialMode":"platform"}],separators=(",",":"))
    budget=json.dumps({"maxConcurrent":1,"maxGlobalDailyCalls":3,
        "maxOwnerDailyCalls":3,"maxGlobalDailyTokens":10000,
        "maxOwnerDailyTokens":10000,"maxPromptBytes":2048},separators=(",",":"))
    tag="r01-tls-"+sha[:10]
    vars_={"CHAT_DISPATCH_ENABLED":"true",
        "CHAT_DATABASE_TLS_MODE":"verified-ca",
        "CHAT_DATABASE_CA_BASE64":base64_cert,
        "CHAT_DATABASE_TLS_SERVERNAME":TLS_SERVERNAME,
        "CHAT_DISPATCH_APPROVED_OWNER_IDS":owner,
        "CHAT_DISPATCH_ENTITLEMENTS_JSON":entitlements,
        "CHAT_DISPATCH_BUDGET_JSON":budget,
        "CHAT_GATEWAY_URL":gate_url,
        "CHAT_GATEWAY_AUDIENCE":audience}
    was_updated=False
    canary_url=""
    restored=False
    try:
        was_updated=True
        canary_url=launch(chat,image,tag,vars_,1)
    finally:
        if was_updated:
            try:
                restore(chat,image,list(SETTINGS),{
                    "CHAT_DISPATCH_ENABLED":"false",
                    "CHAT_DATABASE_TLS_MODE":"private-self-signed"
                },max_instances)
                after=describe(chat)
                if serving(after)!=serving(before[chat]) or not tagged(after,tag):
                    raise RuntimeError("formal traffic drift or canary tag absent")
                newenv=env(after)
                if (newenv.get("CHAT_DISPATCH_ENABLED") or {}).get("value")!="false":
                    raise RuntimeError("dispatch template not restored")
                if (newenv.get("CHAT_DATABASE_TLS_MODE") or {}).get("value")!="private-self-signed":
                    raise RuntimeError("TLS template not restored")
                if any(key in newenv for key in SETTINGS):
                    raise RuntimeError("sensitive trial settings leaked into template")
                restored=True
            except Exception:
                print("r01_staging_restore=FAILED_REQUIRES_OPERATOR_RECONCILIATION")
                raise
    if not restored or not canary_url:
        raise RuntimeError("scoped TLS candidate missing")
    receipt={"source_sha":sha,"tag":tag,"url":canary_url,
        "certificate_sha256":fingerprint,
        "owner_verified_by_preexisting_hash":"PASS",
        "model":MODEL,"database_tls_mode":"verified-ca",
        "deployment":"ZERO_TRAFFIC",
        "provider_calls":0,"production_traffic_modified":False,
        "formal_template_restored":True,
        "manual_oauth_gate":"NOT_REQUIRED",
        "oauth_end_user_roundtrip":"NOT_TESTED"}
    Path(output).write_text(json.dumps(receipt,sort_keys=True,indent=2)+"\n")
    print("r01_tls_canary=READY_ZERO_TRAFFIC")
    print("r01_formal_traffic=UNCHANGED")
    print("r01_formal_service_template_restore=PASS")
if __name__=="__main__":
    main()
