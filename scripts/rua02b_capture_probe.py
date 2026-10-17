#!/usr/bin/env python3
"""One bounded signed Life call to 0%-traffic candidate; no raw payload logs."""
import json,subprocess,sys,uuid
from p0v_gateway_formal_release import id_token,http_code,MODEL

P="gen-lang-client-0593591102"
R="us-central1"
S="omniagent-agent-gateway"
REV="omniagent-agent-gateway-00110-neq"
OWNER="00000000-0000-4000-8000-000000000001"
try:
    doc=json.loads(subprocess.check_output(["gcloud","run","services","describe",S,
        "--project="+P,"--region="+R,"--format=json"],text=True,stderr=subprocess.DEVNULL))
    active=[t for t in doc["status"]["traffic"] if t.get("percent",0)>0]
    candidate=[t for t in doc["status"]["traffic"] if t.get("tag")=="rua02b-usage" and t.get("percent",0)==0]
    if len(active)!=1 or active[0].get("percent")!=100 or len(candidate)!=1 or candidate[0].get("revisionName")!=REV:
        raise RuntimeError("zero_percent_candidate_not_confirmed")
    canonical=doc["status"]["url"].rstrip("/")
    tagged=candidate[0]["url"].rstrip("/")
    token=id_token(canonical,"life-assistant")
    body={"project":"life-assistant","ownerId":OWNER,"requestId":str(uuid.uuid4()),
          "model":MODEL,"prompt":"Reply exactly OK."}
    code,result=http_code(tagged+"/v1/gemini/execute",body,token)
    status=result.get("usageCapture","absent")
    if status not in ("persisted","deferred","unavailable","absent"):
        status="unknown"
    reason=result.get("reason","none")
    if reason not in ("none","provider_unavailable","provider_network_error","provider_timeout",
        "provider_invalid_response","output_limit","unexpected_failure","provider_rejected"):
        reason="other"
    print("rua02b_tagged_life_http="+str(code))
    print("rua02b_tagged_life_capture="+status)
    print("rua02b_tagged_life_failure_reason="+reason)
    print("rua02b_formal_gateway_traffic=UNCHANGED_100_PERCENT")
except Exception:
    print("rua02b_tagged_probe=BLOCKED")
    sys.exit(1)
