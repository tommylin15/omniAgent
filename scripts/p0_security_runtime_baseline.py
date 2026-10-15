#!/usr/bin/env python3
"""Read-only R03/R15/R01 runtime inventory; no Secret versions or user data.
A missing permission is NOT a successful security assertion.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PROJECT="gen-lang-client-0593591102"
REGION="us-central1"
CI=f"serviceAccount:omniagent-ci@{PROJECT}.iam.gserviceaccount.com"
SERVICES=("omniagent-chat","omniagent-agent-gateway","omniagent-shared-codex")
SHA=re.compile(r"^[0-9a-f]{40}$")

def read_gcloud(*argv):
    try:
        result=subprocess.run(["gcloud",*argv],check=True,capture_output=True,
                              text=True,timeout=40)
        return json.loads(result.stdout)
    except (subprocess.CalledProcessError,subprocess.TimeoutExpired,ValueError,OSError):
        return None

def env_names_and_mode(doc):
    spec=((doc or {}).get("spec") or {}).get("template") or {}
    containers=(spec.get("spec") or {}).get("containers") or []
    if len(containers)!=1: return {"status":"NOT_VERIFIED"}
    env={v.get("name"):v for v in containers[0].get("env",[]) if isinstance(v,dict)}
    val=lambda k: (env.get(k) or {}).get("value")
    supplied=lambda k: k in env and (bool(val(k)) or bool((env[k]).get("valueFrom")))
    return {"status":"VERIFIED_METADATA",
      "dispatch_enabled":"YES" if val("CHAT_DISPATCH_ENABLED")=="true" else "NO",
      "tls_mode":val("CHAT_DATABASE_TLS_MODE") if val("CHAT_DATABASE_TLS_MODE") in
        ("default","verified-ca","private-self-signed") else "UNSET_OR_OTHER",
      "verified_ca_present":supplied("CHAT_DATABASE_CA_PEM"),
      "verified_hostname_present":supplied("CHAT_DATABASE_TLS_SERVERNAME"),
      "chat_budget_present":supplied("CHAT_DISPATCH_BUDGET_JSON"),
      "approved_owners_present":supplied("CHAT_DISPATCH_APPROVED_OWNER_IDS"),
      "entitlements_present":supplied("CHAT_DISPATCH_ENTITLEMENTS_JSON"),
      "shared_quota_enabled":"YES" if val("GEMINI_SHARED_QUOTA_ENABLED")=="true" else "NO",
      "shared_owner_auth_enabled":"YES" if val("GEMINI_SHARED_REQUIRE_OWNER_AUTHORIZATION")=="true" else "NO",
      "ledger_db_present":supplied("GEMINI_SHARED_LEDGER_DATABASE_URL"),
      "owner_codex_secrets_present":supplied("CODEX_OWNER_SECRETS"),
      "service_account_present":bool((spec.get("spec") or {}).get("serviceAccountName"))
    }

def main():
    sha=sys.argv[1]
    if not SHA.fullmatch(sha): raise SystemExit("invalid source SHA")
    result={"source_sha":sha,"project":PROJECT,"mode":"READ_ONLY",
            "credential_payload_reads":"NONE","mutations":"NONE"}
    bindings=read_gcloud("projects","get-iam-policy",PROJECT,"--format=json")
    if bindings is None:
        result["project_iam"]="NOT_VERIFIED_PERMISSION_OR_QUERY"
    else:
        roles=sorted(str(b["role"]) for b in bindings.get("bindings",[])
                     if CI in b.get("members",[]))
        high={"roles/run.admin","roles/cloudbuild.builds.editor",
              "roles/compute.osAdminLogin","roles/iap.tunnelResourceAccessor",
              "roles/secretmanager.secretAccessor"}
        result["project_iam"]="READABLE"
        result["ci_role_count"]=len(roles)
        result["ci_risky_project_roles"]=sorted(high.intersection(roles))
        result["ci_project_iam_least_privilege"]=(
            "BROAD_ROLES_PRESENT" if high.intersection(roles)
            else "NO_TRACKED_BROAD_ROLE_IN_PROJECT_POLICY")
    for service in SERVICES:
        doc=read_gcloud("run","services","describe",service,"--project="+PROJECT,
                        "--region="+REGION,"--format=json")
        result[service]=env_names_and_mode(doc)
    # Only inspect the own DB via the historical shared VM; DB *name* is
    # bounded to omniagent_chat. No writes, no SELECT owner identifiers.
    cmd=("sudo docker exec -u postgres janus-postgres "
         "psql -X -A -t -v ON_ERROR_STOP=1 -d omniagent_chat "
         "-c \"SELECT CASE WHEN to_regclass('omni_chat.model_daily_budgets') "
         "IS NULL THEN 'MISSING' ELSE 'PRESENT' END\"")
    try:
        r=subprocess.run(["gcloud","compute","ssh","janus-postgres-dev",
            "--zone=us-central1-a","--project="+PROJECT,"--tunnel-through-iap",
            "--quiet","--command="+cmd],capture_output=True,text=True,timeout=50)
        text=r.stdout.strip()
        if r.returncode==0 and re.search(r"(?m)^PRESENT$",text):
            result["chat_budget_migration"]="PRESENT"
        elif r.returncode==0 and re.search(r"(?m)^MISSING$",text):
            result["chat_budget_migration"]="MISSING"
        else:
            result["chat_budget_migration"]="NOT_VERIFIED_IAP_OR_DB"
    except (OSError,subprocess.TimeoutExpired):
        result["chat_budget_migration"]="NOT_VERIFIED_IAP_OR_DB"
    result["r01_final_gate"]="BLOCKED_NEEDS_OWNER_AND_REAL_LIVE_INFERENCE"
    out=Path(sys.argv[2])
    out.write_text(json.dumps(result,sort_keys=True,indent=2)+"\n")
    print(json.dumps(result,sort_keys=True))
if __name__=="__main__":
    if len(sys.argv)!=3: raise SystemExit("usage: runtime_audit.py SHA report.json")
    main()
