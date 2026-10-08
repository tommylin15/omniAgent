#!/usr/bin/env bash
# Administrator-only, one-time migration. No new Secret resource is created.
set -euo pipefail
set +x
umask 077

PROJECT="gen-lang-client-0593591102"
BUNDLE="omniagent-bundle"
DB_SOURCE="omniagent-chat-db"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

# This updates the existing bundle *latest*, never mutates pinned live version 2.
gcloud secrets versions access latest --secret="$BUNDLE" \
  --project="$PROJECT" --out-file="$scratch/existing.json" >/dev/null
gcloud secrets versions access latest --secret="$DB_SOURCE" \
  --project="$PROJECT" --out-file="$scratch/old-dsn.txt" >/dev/null
python3 "$repo_root/infra/gcp/merge-omniagent-bundle.py" \
  "$scratch/existing.json" "$scratch/old-dsn.txt" "$scratch/new.json"

# Do not auto-modify IAM, service deployments, tags or traffic.
printf 'Commit new version to existing %s? Type YES: ' "$BUNDLE"
read -r confirmation
if [[ "$confirmation" != YES ]]; then
  echo 'No Secret Manager changes made'
  exit 0
fi
gcloud secrets versions add "$BUNDLE" --project="$PROJECT" \
  --data-file="$scratch/new.json" --quiet >/dev/null
echo "existing_secret_new_version=CREATED"
echo "credentials_in_stdout=NONE"
echo "legacy_db_secret=RETAINED_FOR_ROLLBACK"
