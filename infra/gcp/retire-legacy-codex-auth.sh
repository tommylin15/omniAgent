#!/usr/bin/env bash
# Destructive one-time operator action. It DOES NOT modify external application code.
# Run only after shared Cloud Run live provider and tenant-isolation acceptance PASS.
set -euo pipefail
umask 077

PROJECT="gen-lang-client-0593591102"
PROJECT_NUMBER="131494961796"
REGION="us-central1"
SERVICE="omniagent-shared-codex"
DESTINATION="omniagent-shared-codex-auth"
EXPECTED_SHA="ff282575fb13163018827761b8bfee8e8789bcb3"
ACCEPTANCE_RUN="37709954944"
: "${LEGACY_CODEX_AUTH_SECRET:?Set LEGACY_CODEX_AUTH_SECRET to the approved retiring Secret name}"
: "${CONFIRM_LEGACY_CODEX_RETIREMENT:?Set CONFIRM_LEGACY_CODEX_RETIREMENT=RETIRE_AFTER_LIVE_PASS}"
[[ "$CONFIRM_LEGACY_CODEX_RETIREMENT" == "RETIRE_AFTER_LIVE_PASS" ]] || {
  echo "Retirement confirmation value is incorrect" >&2
  exit 2
}
if [[ ! "$LEGACY_CODEX_AUTH_SECRET" =~ ^[a-z][a-z0-9_-]{2,254}$ ]] ||
   [[ "$LEGACY_CODEX_AUTH_SECRET" == "$DESTINATION" ]]; then
  echo "Refusing invalid or dedicated Secret as retirement target" >&2
  exit 2
fi

actual_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$actual_number" == "$PROJECT_NUMBER" ]] || {
  echo "GCP project number mismatch" >&2
  exit 2
}

# Require the specifically verified GitHub workflow attempt; code-only PASS is insufficient.
gh api "repos/tommylin15/omniAgent/actions/runs/$ACCEPTANCE_RUN" \
  --jq '[.conclusion,.run_attempt,.head_sha]|@tsv' > /tmp/omniagent-codex-acceptance.tsv
IFS=$'\t' read -r conclusion attempt sha < /tmp/omniagent-codex-acceptance.tsv
rm -f /tmp/omniagent-codex-acceptance.tsv
if [[ "$conclusion" != "success" || "$attempt" != "3" || "$sha" != "$EXPECTED_SHA" ]]; then
  echo "Live shared Codex acceptance evidence mismatch" >&2
  exit 1
fi
echo "live_acceptance_readback=PASS"

gcloud secrets versions describe latest --project="$PROJECT" \
  --secret="$DESTINATION" --format='value(state)' | grep -Fx ENABLED >/dev/null

gcloud run services describe "$SERVICE" --project="$PROJECT" \
  --region="$REGION" --format=json > /tmp/omniagent-codex-service.json
gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT" \
  --region="$REGION" --format=json > /tmp/omniagent-codex-service-iam.json

EXPECTED_SHA="$EXPECTED_SHA" PROJECT="$PROJECT" python3 - <<'PY'
import json,os,sys
d=json.load(open("/tmp/omniagent-codex-service.json"))
iam=json.load(open("/tmp/omniagent-codex-service-iam.json"))
url=d.get("status",{}).get("url","")
ready=d.get("status",{}).get("latestReadyRevisionName","")
spec=d.get("spec",{}).get("template",{}).get("spec",{})
containers=spec.get("containers") or []
if not (url.startswith("https://") and ready and containers):
    raise SystemExit("shared Codex Cloud Run is not ready")
if spec.get("serviceAccountName")!="omniagent-shared-codex@"+os.environ["PROJECT"]+".iam.gserviceaccount.com":
    raise SystemExit("dedicated runtime identity mismatch")
image=containers[0].get("image","")
if os.environ["EXPECTED_SHA"] not in image:
    raise SystemExit("deployed image is not the accepted revision")
env={x.get("name"):x.get("value") for x in containers[0].get("env",[]) }
if env.get("SHARED_CODEX_AUTH_RESOURCE")!="projects/"+os.environ["PROJECT"]+"/secrets/omniagent-shared-codex-auth":
    raise SystemExit("shared Codex auth is not isolated")
if env.get("SHARED_CODEX_AUDIENCE")!=url:
    raise SystemExit("shared Codex audience does not match deployment")
callers=json.loads(env.get("SHARED_CODEX_CALLERS_JSON","{}"))
if set(callers)!={"life-assistant","market-mart","omniagent"}:
    raise SystemExit("caller mapping does not include all three approved consumers")
members=set()
for binding in iam.get("bindings",[]):
    if binding.get("role")=="roles/run.invoker":
        members.update(binding.get("members",[]))
if "allUsers" in members or "allAuthenticatedUsers" in members:
    raise SystemExit("shared service has public invocation access")
if not all("serviceAccount:"+v in members for v in callers.values()):
    raise SystemExit("shared Codex caller allowlist is not reflected in Cloud Run IAM")
print("dedicated_cloud_run_readback=PASS")
print("private_ingress_and_caller_iam=PASS")
PY
rm -f /tmp/omniagent-codex-service.json /tmp/omniagent-codex-service-iam.json

gcloud secrets describe "$LEGACY_CODEX_AUTH_SECRET" --project="$PROJECT" \
  --format='value(name)' >/dev/null
echo "retiring_legacy_secret=$LEGACY_CODEX_AUTH_SECRET"
echo "warning=existing external jobs that still read the legacy Secret may fail until their integration is migrated"
# User explicitly approved independent retirement without waiting for consumer cutover.
gcloud secrets delete "$LEGACY_CODEX_AUTH_SECRET" --project="$PROJECT" --quiet >/dev/null
echo "legacy_secret_retirement=PASS"
echo "external_consumer_adapter_migration=NOT_ASSERTED"
