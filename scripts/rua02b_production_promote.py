#!/usr/bin/env python3
"""RUA-02B: authorized Gateway 100% promotion BEFORE provider usage canary.

Immutable 0% candidate only, scoped to the Gateway. A failure or missing
post-deploy evidence rolls back the previous serving revision. Synthetic
Owner IDs are auditable provider test events, not human usage. No secrets,
tokens, raw provider output or prompts are emitted to CI logs.
"""
from __future__ import annotations
import json
import re
import subprocess
import sys
import time
import uuid

from p0v_gateway_formal_release import (
    EXPECTED, MODEL, id_token, http_code, iam_check,
)

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
GATEWAY = "omniagent-agent-gateway"
OTHERS = ("omniagent-chat", "omniagent-shared-codex")
CANDIDATE = "omniagent-agent-gateway-00107-doy"
TAG = "rua02b-usage"
PROBE_OWNER = "00000000-0000-4000-8000-000000000001"
PROJECTS = ("life-assistant", "market-mart", "omniagent")

class Blocked(Exception):
    pass

def safe_command(*args: str, timeout: int = 130) -> str:
    try:
        p = subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError):
        raise Blocked("cloud_command_unavailable") from None
    if p.returncode:
        raise Blocked("cloud_command_failed") from None
    return p.stdout.strip()

def cloud(kind: str, name: str) -> dict:
    return json.loads(safe_command("gcloud", "run", kind, "describe", name,
        "--project=" + PROJECT, "--region=" + REGION, "--format=json"))

def active(service: dict) -> str:
    rows = [x for x in service.get("status", {}).get("traffic", []) if x.get("percent",0)>0]
    if len(rows)!=1 or rows[0].get("percent")!=100 or not rows[0].get("revisionName"):
        raise Blocked("live_traffic_not_one_full_revision")
    return rows[0]["revisionName"]

def original_state():
    gate = cloud("services",GATEWAY)
    old=active(gate)
    if old == CANDIDATE: raise Blocked("candidate_already_live")
    tagging=[x for x in gate.get("status",{}).get("traffic",[])
             if x.get("tag")==TAG and x.get("percent",0)==0]
    if len(tagging)!=1 or tagging[0].get("revisionName")!=CANDIDATE:
        raise Blocked("candidate_tag_mismatch")
    revision=cloud("revisions",CANDIDATE)
    if not any(x.get("type")=="Ready" and x.get("status")=="True"
               for x in revision.get("status",{}).get("conditions",[])):
        raise Blocked("candidate_revision_not_ready")
    env={x["name"]:x for x in revision.get("spec",{}).get("containers",[{}])[0].get("env",[])}
    if (env.get("GEMINI_SHARED_USAGE_ENABLED",{}).get("value")!="true"
        or env.get("GEMINI_SHARED_EXECUTION_ENABLED",{}).get("value")!="true"
        or env.get("GEMINI_SHARED_MODEL",{}).get("value")!=MODEL):
        raise Blocked("candidate_model_or_capture_mismatch")
    ref=env.get("OMNIAGENT_PROVIDER_BUNDLE",{}).get("valueFrom",{}).get("secretKeyRef",{})
    if (ref.get("name"),str(ref.get("key")))!=("omniagent-bundle","latest"):
        raise Blocked("candidate_bundle_mismatch")
    callers=json.loads(env["GEMINI_SHARED_CALLERS_JSON"]["value"])
    if callers!=EXPECTED:
        raise Blocked("candidate_service_identity_contract_drift")
    iam_check()
    base=gate["status"]["url"].rstrip("/")
    if not re.fullmatch(r"https://omniagent-agent-gateway-[a-z0-9-]+\.a\.run\.app",base):
        raise Blocked("canonical_audience_invalid")
    others={name:active(cloud("services",name)) for name in OTHERS}
    return old,base,others

def traffic(revision:str) -> None:
    safe_command("gcloud","run","services","update-traffic",GATEWAY,
        "--to-revisions="+revision+"=100","--project="+PROJECT,
        "--region="+REGION,"--quiet",timeout=180)

def assert_others(expected:dict):
    for name,revision in expected.items():
        if active(cloud("services",name))!=revision:
            raise Blocked("other_service_traffic_drift")

def event_readback(request_id:str, project:str) -> bool:
    # Only bounded aggregate metadata; no password, payload or prompt.
    sql=("SELECT count(*)::int || ':' || COALESCE(min(status),'') || ':' || "
         "COALESCE(min(model),'') || ':' || COALESCE(min(owner_id::text),'') "
         "FROM omni_gateway.router_usage_events "
         "WHERE request_id='"+request_id+"'::uuid AND project='"+project+"'")
    command=('sudo docker exec -u postgres janus-postgres '
        'psql -X -A -t -v ON_ERROR_STOP=1 -d omniagent_gateway -c '+json.dumps(sql))
    for attempt in range(1,7):
        reply=safe_command("gcloud","compute","ssh","janus-postgres-dev",
           "--project="+PROJECT,"--zone=us-central1-a","--tunnel-through-iap",
           "--quiet","--command="+command,timeout=90).splitlines()
        expected="1:completed:"+MODEL+":"+PROBE_OWNER
        if reply and reply[-1].strip()==expected:
            return True
        if any(x.strip().startswith("2:") for x in reply):
            raise Blocked("duplicate_provider_usage_receipt")
        if attempt<6: time.sleep(2)
    return False

def smoke_canonical(audience:str):
    for project in PROJECTS:
        token=id_token(audience,project)
        request_id=str(uuid.uuid4())
        payload={"project":project,"ownerId":PROBE_OWNER,"requestId":request_id,
            "prompt":"Reply exactly OK.","model":MODEL}
        http, response=http_code(audience+"/v1/gemini/execute",payload,token)
        if (http!=200 or response.get("status")!="completed"
            or response.get("project")!=project or response.get("requestId")!=request_id
            or response.get("model")!=MODEL
            or not isinstance(response.get("result",{}).get("text"),str)
            or not response["result"]["text"].strip()):
            raise Blocked("signed_provider_"+project+"_failed")
        print("rua02b_formal_signed_"+project+"=PASS",flush=True)
        swapped=dict(payload,project="omniagent" if project!="omniagent" else "life-assistant")
        denied,body=http_code(audience+"/v1/gemini/execute",swapped,token)
        if denied!=403 or body.get("error")!="caller_project_mismatch":
            raise Blocked("cross_project_denial_"+project+"_failed")
        if not event_readback(request_id,project):
            raise Blocked("real_db_usage_row_"+project+"_missing")
        print("rua02b_formal_db_row_"+project+"=PASS",flush=True)
    unauthenticated,_=http_code(audience+"/health",None,None)
    if unauthenticated!=403:
        raise Blocked("private_iam_unauthenticated_denial_failed")
    print("rua02b_formal_unauthorized_403=PASS",flush=True)

def main() -> int:
    previous=""
    switched=False
    other_revisions={}
    try:
        previous,audience,other_revisions=original_state()
        print("rua02b_preflight=PASS",flush=True)
        print("rua02b_prior_formal_revision="+previous,flush=True)
        # Intentional owner-approved promotion BEFORE provider canary.
        switched=True  # even if gcloud reports an error after applying change
        traffic(CANDIDATE)
        if active(cloud("services",GATEWAY))!=CANDIDATE:
            raise Blocked("promotion_readback_failed")
        assert_others(other_revisions)
        iam_check()
        print("rua02b_formal_gateway_100_percent=PASS",flush=True)
        smoke_canonical(audience)
        if active(cloud("services",GATEWAY))!=CANDIDATE:
            raise Blocked("post_model_traffic_drift")
        assert_others(other_revisions)
        print("rua02b_production_traffic_and_real_db_usage=PASS",flush=True)
        print("rua02b_probe_owner=SYNTHETIC_NOT_HUMAN",flush=True)
        print("rua02b_chat_admin_dashboard=NOT_YET_VERIFIED",flush=True)
        return 0
    except Exception as exc:
        reason=str(exc)
        if not re.fullmatch(r"[a-zA-Z0-9_:-]{1,110}",reason):
            reason="bounded_validation_failed"
        print("rua02b_promotion_or_smoke=BLOCKED:"+reason,file=sys.stderr,flush=True)
        if switched and previous:
            try:
                traffic(previous)
                if active(cloud("services",GATEWAY))!=previous:
                    raise Blocked("rollback_not_confirmed")
                assert_others(other_revisions)
                print("rua02b_formal_rollback=PASS",flush=True)
            except Exception:
                print("rua02b_formal_rollback=UNKNOWN_MANUAL_URGENT",file=sys.stderr,flush=True)
        else:
            print("rua02b_formal_traffic_mutation=NOT_ATTEMPTED",flush=True)
        return 1

if __name__ == "__main__":
    sys.exit(main())
