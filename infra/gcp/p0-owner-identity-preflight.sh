#!/usr/bin/env bash
# Read-only Owner identity verification for one user-supplied /v1/me UUID.
# SHA256 is used solely to avoid storing/logging a UUID in a public repo.
set -euo pipefail
umask 077
PROJECT='gen-lang-client-0593591102'
ZONE='us-central1-a'
HOST="$(printf '%s' 'amFudXMtcG9zdGdyZXMtZGV2' | base64 -d)"
OWNER_SHA256='bd46f8f29ba78faaa606f03d6a760c1726ce27a7cd75381d5c04b9525861f70f'
SHARED_SECRET='omniagent-shared-codex-auth'
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 2
test "$(git rev-parse HEAD)" = "$GITHUB_SHA" || exit 2
test "$(git ls-remote https://github.com/tommylin15/omniAgent.git refs/heads/main | cut -f1)" = "$GITHUB_SHA" || {
  echo 'owner_identity=BLOCKED_STALE_MAIN'
  exit 1
}
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat > "$work/omniagent-p0-owner-check.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077
db='omniagent_chat'
role='omniagent_chat_app'
container="$(printf '%s' 'amFudXMtcG9zdGdyZXM=' | base64 -d)"
expected='bd46f8f29ba78faaa606f03d6a760c1726ce27a7cd75381d5c04b9525861f70f'
trap 'sudo rm -f /tmp/omniagent-p0-owner-check.sh' EXIT
sudo docker inspect --format '{{.State.Running}}' "$container" | grep -qx true
pg() { sudo docker exec -u postgres "$container" psql -X -A -t -v ON_ERROR_STOP=1 "$@"; }
test "$(pg -d postgres -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$db'")" = "$role" || {
  echo 'owner_identity=BLOCKED_WRONG_DATABASE'
  exit 1
}
test "$(pg -d "$db" -c "SELECT to_regclass('omni_chat.owners') IS NOT NULL")" = t || {
  echo 'owner_identity=BLOCKED_OWNERS_SCHEMA_MISSING'
  exit 1
}
found=0
while IFS= read -r owner; do
  [[ -n "$owner" ]] || continue
  digest="$(printf '%s' "$owner" | sha256sum | cut -d' ' -f1)"
  if [[ "$digest" == "$expected" ]]; then
    found=$((found+1))
  fi
done < <(pg -d "$db" -c "SELECT owner_id FROM omni_chat.owners WHERE issuer <> '' AND subject <> ''")
if [[ "$found" -ne 1 ]]; then
  echo 'owner_identity=BLOCKED_NOT_FOUND_OR_DUPLICATE'
  exit 1
fi
echo 'owner_identity=PASS_DB_BACKED_OAUTH_OWNER'
echo 'owner_identity_query=READ_ONLY'
echo 'other_databases_touched=NO'
REMOTE
chmod 700 "$work/omniagent-p0-owner-check.sh"
gcloud compute scp "$work/omniagent-p0-owner-check.sh" "$HOST:/tmp/" \
  --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --quiet
gcloud compute ssh "$HOST" --zone="$ZONE" --project="$PROJECT" \
  --tunnel-through-iap --quiet \
  --command='sudo bash /tmp/omniagent-p0-owner-check.sh'
echo 'trial_secret_payload_access=NO'
# Metadata only, no secret version payload. Never add IAM policy as part of
# identity verification. A missing permission remains NOT_VERIFIED.
if gcloud secrets describe "$SHARED_SECRET" --project="$PROJECT" \
     --format='value(name)' >/dev/null 2>&1; then
  echo 'shared_secret_metadata=PRESENT'
else
  echo 'shared_secret_metadata=NOT_VERIFIED'
fi
if [[ "$(gcloud secrets versions describe latest --secret="$SHARED_SECRET" \
       --project="$PROJECT" --format='value(state)' 2>/dev/null || :)" == 'ENABLED' ]]; then
  echo 'shared_secret_latest_version=ENABLED'
else
  echo 'shared_secret_latest_version=NOT_VERIFIED'
fi
gcloud run services describe omniagent-agent-gateway --project="$PROJECT" \
  --region=us-central1 --format=json > "$work/gateway.json"
python3 - "$work/gateway.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
spec=(((s.get("spec") or {}).get("template") or {}).get("spec") or {})
sa=spec.get("serviceAccountName","")
if not sa.startswith("omniagent-") or not sa.endswith("@gen-lang-client-0593591102.iam.gserviceaccount.com"):
    raise SystemExit("gateway_runtime_identity=BLOCKED_UNRECOGNIZED_ACCOUNT")
print("gateway_runtime_identity=VERIFIED_OMNIAGENT_SCOPED")
print("shared_secret_iam_access=NOT_VERIFIED")  # IAM grant deliberately not attempted.
PY
