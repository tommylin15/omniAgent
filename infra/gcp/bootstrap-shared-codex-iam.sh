#!/usr/bin/env bash
# One-time, operator-authenticated bootstrap. Never run with omniagent-ci:
# it intentionally does not have project-wide Secret Manager administration.
set -euo pipefail
umask 077

PROJECT="gen-lang-client-0593591102"
PROJECT_NUMBER="131494961796"
DEST="omniagent-shared-codex-auth"
: "${SOURCE_CODEX_AUTH_SECRET:?Set SOURCE_CODEX_AUTH_SECRET to the approved existing Codex login Secret name}"
if [[ ! "$SOURCE_CODEX_AUTH_SECRET" =~ ^[a-z][a-z0-9_-]{2,254}$ ]]; then
  echo "Invalid existing credential Secret name" >&2
  exit 2
fi
if [[ "$SOURCE_CODEX_AUTH_SECRET" == "$DEST" ]]; then
  echo "Source and destination must differ" >&2
  exit 2
fi

gcloud config set project "$PROJECT" >/dev/null
actual_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$actual_number" == "$PROJECT_NUMBER" ]] || { echo "Unexpected GCP project; stopping" >&2; exit 2; }
echo "project_verified=$PROJECT"
echo "active_google_identity=$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"

CI="omniagent-ci@$PROJECT.iam.gserviceaccount.com"
RUNTIME="omniagent-shared-codex@$PROJECT.iam.gserviceaccount.com"
CALLER_LIFE="omniagent-codex-life-client@$PROJECT.iam.gserviceaccount.com"
CALLER_MARKET="omniagent-codex-market-client@$PROJECT.iam.gserviceaccount.com"
CALLER_CHAT="omniagent-codex-chat-client@$PROJECT.iam.gserviceaccount.com"

for account in omniagent-shared-codex omniagent-codex-life-client omniagent-codex-market-client omniagent-codex-chat-client; do
  email="$account@$PROJECT.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$email" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$account" --project="$PROJECT" \
      --display-name="omniAgent dedicated shared Codex identity: $account" --quiet >/dev/null
  fi
  gcloud iam service-accounts describe "$email" --project="$PROJECT" --format='value(email)'
done

if ! gcloud secrets describe "$DEST" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud secrets create "$DEST" --project="$PROJECT" \
    --replication-policy=automatic --quiet >/dev/null
  echo "dedicated_auth_metadata=CREATED"
fi

# The source is accessed exactly once by the project administrator and is never
# exposed to GitHub Actions, stdout or logs. Do not destroy or change the source.
tempdir="$(mktemp -d)"
cleanup() {
  if command -v shred >/dev/null 2>&1; then
    find "$tempdir" -maxdepth 1 -type f -exec shred -u {} \; 2>/dev/null || true
  fi
  rm -rf "$tempdir"
}
trap cleanup EXIT

if gcloud secrets versions describe latest --secret="$DEST" --project="$PROJECT" \
  --format='value(state)' 2>/dev/null | grep -Fx ENABLED >/dev/null; then
  echo "dedicated_auth_payload=EXISTING_ENABLED_VERSION_PRESERVED"
else
  gcloud secrets versions access latest --secret="$SOURCE_CODEX_AUTH_SECRET" \
    --project="$PROJECT" --out-file="$tempdir/source.json" >/dev/null
  python3 - "$tempdir/source.json" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf8") as f:
    data=json.load(f)
if not isinstance(data,dict) or not isinstance(data.get("tokens"),dict):
    raise SystemExit("Codex source credential structure missing tokens")
if not all(isinstance(data["tokens"].get(k),str) and data["tokens"][k] for k in ("access_token","refresh_token")):
    raise SystemExit("Codex source credential tokens incomplete")
print("source_auth_structure=PASS")
PY
  gcloud secrets versions add "$DEST" --project="$PROJECT" \
    --data-file="$tempdir/source.json" --quiet >/dev/null
  gcloud secrets versions access latest --secret="$DEST" --project="$PROJECT" \
    --out-file="$tempdir/readback.json" >/dev/null
  cmp -s "$tempdir/source.json" "$tempdir/readback.json" || {
    echo "Destination Secret payload readback mismatch" >&2
    exit 1
  }
  echo "dedicated_auth_payload=COPIED_AND_READBACK_VERIFIED"
fi

# Secret access is granted on this destination Secret only.
for role in roles/secretmanager.secretAccessor roles/secretmanager.secretVersionManager; do
  gcloud secrets add-iam-policy-binding "$DEST" --project="$PROJECT" \
    --member="serviceAccount:$RUNTIME" --role="$role" --quiet >/dev/null
done
gcloud secrets add-iam-policy-binding "$DEST" --project="$PROJECT" \
  --member="serviceAccount:$CI" --role=roles/secretmanager.viewer --quiet >/dev/null

# CI can attach only the isolated runtime SA. The test caller accounts have no
# database or Secret Manager permissions; token creator is scoped to each account.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project="$PROJECT" \
  --member="serviceAccount:$CI" --role=roles/iam.serviceAccountUser --quiet >/dev/null
for email in "$CALLER_LIFE" "$CALLER_MARKET" "$CALLER_CHAT"; do
  gcloud iam service-accounts add-iam-policy-binding "$email" --project="$PROJECT" \
    --member="serviceAccount:$CI" --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null
done
# omniAgent Chat may use its own caller SA without inheriting runtime auth.
gcloud iam service-accounts add-iam-policy-binding "$CALLER_CHAT" --project="$PROJECT" \
  --member="serviceAccount:omniagent-chat@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null

# Non-sensitive state readback. CI must still deploy and pass real inference.
gcloud secrets versions describe latest --secret="$DEST" --project="$PROJECT" \
  --format='value(state)' | grep -Fx ENABLED
for email in "$RUNTIME" "$CALLER_LIFE" "$CALLER_MARKET" "$CALLER_CHAT"; do
  gcloud iam service-accounts describe "$email" --project="$PROJECT" \
    --format='value(email)'
done
echo "scoped_iam_bootstrap=PASS"
echo "legacy_secret_retirement=NOT_PERFORMED"
echo "shared_cloud_run_deployment=NOT_PERFORMED"
