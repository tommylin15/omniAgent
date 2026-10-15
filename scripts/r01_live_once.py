#!/usr/bin/env python3
"""Exactly one billable R01 Chat->Gateway->Gemini backend probe.
After an ambiguous HTTP failure NEVER re-issue POST. No manual OAuth gate.
Only redacted metadata is placed in the Actions summary / artifact.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import urllib.error
from urllib.parse import quote

sys.path.insert(0,"scripts")
from p0_owner_trial_stage import describe,env,tagged,serving

PROJECT="gen-lang-client-0593591102"
CHAT="omniagent-chat"
GATEWAY="omniagent-agent-gateway"
OWNER_DIGEST="bd46f8f29ba78faaa606f03d6a760c1726ce27a7cd75381d5c04b9525861f70f"

def gcloud(*args):
    try:
        return subprocess.run(["gcloud",*args],check=True,capture_output=True,text=True,timeout=125).stdout
    except (subprocess.CalledProcessError,subprocess.TimeoutExpired):
        raise RuntimeError("GCP operation denied or failed (redacted)")

def remote(phase,sha):
    host="".join(chr(c) for c in (106,97,110,117,115,45,112,111,115,116,103,114,101,115,45,100,101,118))
    return gcloud("compute","ssh",host,"--project="+PROJECT,"--zone=us-central1-a",
        "--tunnel-through-iap","--quiet",
        "--command=sudo bash /tmp/omniagent-r01-live-once.sh "+phase+" "+sha)

def remote_install():
    host="".join(chr(c) for c in (106,97,110,117,115,45,112,111,115,116,103,114,101,115,45,100,101,118))
    gcloud("compute","scp","infra/gcp/r01-live-once-db.sh",host+":/tmp/omniagent-r01-live-once.sh",
           "--project="+PROJECT,"--zone=us-central1-a","--tunnel-through-iap","--quiet")

def remote_cleanup():
    host="".join(chr(c) for c in (106,97,110,117,115,45,112,111,115,116,103,114,101,115,45,100,101,118))
    try:
        gcloud("compute","ssh",host,"--project="+PROJECT,"--zone=us-central1-a",
               "--tunnel-through-iap","--quiet",
               "--command=sudo rm -f /tmp/omniagent-r01-live-once.sh")
    except RuntimeError: pass

def mint_token(service_email,audience):
    if not re.fullmatch(r"omniagent-[a-z-]+@gen-lang-client-0593591102[.]iam[.]gserviceaccount[.]com",
                        service_email):
        raise RuntimeError("unexpected service identity")
    from urllib.parse import urlparse
    if urlparse(audience).scheme!="https":
        raise RuntimeError("invalid Chat internal audience")
    access=gcloud("auth","print-access-token").strip()
    data=json.dumps({"audience":audience,"includeEmail":True}).encode()
    target=("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"
        +quote(service_email,safe="")+":generateIdToken")
    req=urllib.request.Request(target,data=data,headers={
        "Authorization":"Bearer "+access,"Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            token=json.load(r).get("token")
    except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError):
        raise RuntimeError("narrow service token permission unavailable")
    if not isinstance(token,str) or token.count(".")!=2:
        raise RuntimeError("invalid service identity token")
    return token

def inspect_canary(sha):
    chat=describe(CHAT); gate=describe(GATEWAY)
    if any(len(serving(svc))!=1 or sum(serving(svc).values())!=100 for svc in (chat,gate)):
        raise RuntimeError("unexpected production serving allocation")
    chat_tag=tagged(chat,"r01-tls-"+sha[:10])
    gw_tag=tagged(gate,"ghcr-"+sha[:12])
    candidate=json.loads(gcloud("run","revisions","describe",chat_tag["revisionName"],
        "--project="+PROJECT,"--region=us-central1","--format=json"))
    rows=((candidate.get("spec") or {}).get("containers") or [{}])[0].get("env") or []
    vars={row.get("name"):row.get("value") for row in rows}
    if vars.get("CHAT_DISPATCH_ENABLED")!="true" or vars.get("CHAT_DATABASE_TLS_MODE")!="verified-ca":
        raise RuntimeError("the approved verified-TLS Chat revision has no dispatcher")
    if vars.get("CHAT_GATEWAY_URL","").rstrip("/")!=gw_tag["url"].rstrip("/"):
        raise RuntimeError("Chat route does not point to approved Gateway SHA")
    import hashlib
    owners=[x.strip() for x in vars.get("CHAT_DISPATCH_APPROVED_OWNER_IDS","").split(",") if x.strip()]
    if len(owners)!=1 or hashlib.sha256(owners[0].encode()).hexdigest()!=OWNER_DIGEST:
        raise RuntimeError("Chat canary does not limit to one DB-backed Owner")
    models=json.loads(vars.get("CHAT_DISPATCH_ENTITLEMENTS_JSON","[]"))
    if models!=[{"ownerId":owners[0],"runtime":"gemini",
               "model":"gemini-3.5-flash-lite","credentialMode":"platform"}]:
        raise RuntimeError("model entitlement differs from approved R01 scope")
    budget=json.loads(vars.get("CHAT_DISPATCH_BUDGET_JSON","{}"))
    if budget.get("maxConcurrent")!=1 or budget.get("maxOwnerDailyCalls",1000)>3:
        raise RuntimeError("no bounded owner budget")
    if vars.get("CHAT_BYOK_MANAGEMENT_ENABLED")=="true":
        raise RuntimeError("unexpected BYOK")
    live=env(chat)
    if (live.get("CHAT_DISPATCH_ENABLED") or {}).get("value")!="false":
        raise RuntimeError("live Chat dispatch unexpectedly enabled")
    service_audience=(live.get("CHAT_INTERNAL_AUDIENCE") or {}).get("value")
    allowed=(live.get("CHAT_INTERNAL_ALLOWED_EMAILS") or {}).get("value","")
    allowed={x.strip().lower() for x in allowed.split(",") if x.strip()}
    authorized=[email for email in (
        "omniagent-gateway@"+PROJECT+".iam.gserviceaccount.com",
        "omniagent-codex-chat-client@"+PROJECT+".iam.gserviceaccount.com",
        "omniagent-chat@"+PROJECT+".iam.gserviceaccount.com") if email in allowed]
    if not authorized:
        raise RuntimeError("no pre-approved internal automated Chat caller")
    return chat_tag["url"],service_audience,authorized[0],serving(chat),serving(gate)

def must_http(url,path,code):
    try:
        with urllib.request.urlopen(url.rstrip("/")+path,timeout=30) as r:
            actual=r.status
    except urllib.error.HTTPError as err: actual=err.code
    if actual!=code: raise RuntimeError("Chat preflight unexpected status")

def main():
    if len(sys.argv)!=3: raise SystemExit("usage: r01_live_once.py SOURCE_SHA RECEIPT")
    sha=sys.argv[1]
    if not re.fullmatch("[a-f0-9]{40}",sha):
        raise SystemExit("invalid SHA")
    result={"source_sha":sha,"intent":"ONE_BOUNDED_CHAT_DISPATCH_ATTEMPT","status":"BLOCKED",
            "chat_dispatch_http_attempts":0,"traffic_mutated":"NO","manual_oauth_gate":"NOT_REQUIRED",
            "user_google_oauth_end_to_end":"NOT_TESTED",
            "db_attempt_auto_retry":"NEVER"}
    receipt=Path(sys.argv[2])
    installed=False
    try:
        url,audience,caller,serving_chat,serving_gate=inspect_canary(sha)
        must_http(url,"/ready",200)
        must_http(url,"/internal/v1/chat/reconciliation:candidates",401)
        token=mint_token(caller,audience)
        remote_install();installed=True
        response=remote("prepare",sha)
        if "r01_fixture=CREATED_ONCE" not in response:
            raise RuntimeError("one-time fixture was not prepared")
        result["synthetic_fixture"]="CREATED_ONCE"
        # This is the ONLY authorized POST, through the real Chat dispatcher.
        # Never retry, even if HTTP times out after charging tokens.
        result["chat_dispatch_http_attempts"]=1
        req=urllib.request.Request(url.rstrip("/")+"/internal/v1/chat/dispatch:once",
            method="POST",headers={"Authorization":"Bearer "+token,
                "Content-Type":"application/json"},data=b"{}")
        try:
            with urllib.request.urlopen(req,timeout=115) as resp:
                raw=json.load(resp); status=resp.status
            if status!=200 or not isinstance(raw,dict) or raw.get("status")!="completed":
                result["http_result"]="NO_CONFIRMED_COMPLETION"
            else:
                result["http_result"]="COMPLETED"
        except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError,ValueError):
            result["http_result"]="UNKNOWN_NO_RETRY"
        read=remote("inspect",sha).strip().splitlines()
        if len(read)!=1: raise RuntimeError("DB readback missing or ambiguous")
        counts=json.loads(read[0])
        result["db_receipt"]={k:counts[k] for k in ("status","text_events","completed_events",
            "error_events","closed_at_present","daily_owner_budget_count","owner_scope_match","provider_usage_total_tokens")}
        result["provider_usage_readback"]=("PRESENT" if isinstance(counts.get("provider_usage_total_tokens"),int) and counts["provider_usage_total_tokens"]>0 else "NOT_VERIFIED")
        result["status"]="PASS" if (result["http_result"]=="COMPLETED" and
            counts.get("status")=="COMPLETED" and counts.get("text_events",0)==1 and
            counts.get("completed_events",0)==1 and counts.get("error_events",0)==0 and
            counts.get("closed_at_present") is True and
            counts.get("owner_scope_match") is True and
            counts.get("daily_owner_budget_count",0)>=1) else "PARTIAL_UNVERIFIED"
        after_chat=describe(CHAT);after_gate=describe(GATEWAY)
        if serving(after_chat)!=serving_chat or serving(after_gate)!=serving_gate:
            result["traffic_mutated"]="UNEXPECTED_DRIFT"
            result["status"]="BLOCKED_TRAFFIC_DRIFT"
        print("r01_real_backend_inference="+result["status"])
        print("r01_one_provider_attempt="+str(result["chat_dispatch_http_attempts"]))
        if result["status"]!="PASS":
            raise RuntimeError("live inference or DB terminal readback did not pass")
    except Exception as exc:
        result["error_class"]=type(exc).__name__
        print("r01_real_backend_inference=BLOCKED_OR_PARTIAL")
        raise
    finally:
        if installed: remote_cleanup()
        receipt.write_text(json.dumps(result,sort_keys=True,indent=2)+"\n",encoding="utf-8")

if __name__=="__main__":
    main()
