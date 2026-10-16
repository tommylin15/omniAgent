#!/usr/bin/env bash
# R05: read-only, aggregate-only inventory of omniAgent's own logical DB.
# It is NOT human Google OAuth token evidence and cannot promote Dispatch.
set -euo pipefail
umask 077
PROJECT='gen-lang-client-0593591102'
ZONE='us-central1-a'
HOST="$(printf '%s' 'amFudXMtcG9zdGdyZXMtZGV2' | base64 -d)"
container="$(printf '%s' 'amFudXMtcG9zdGdyZXM=' | base64 -d)"
DB='omniagent_chat'
ROLE='omniagent_chat_app'
if [[ ! "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then exit 2; fi
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
test "$(git ls-remote https://github.com/tommylin15/omniAgent.git refs/heads/main | cut -f1)" = "$GITHUB_SHA"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat > "$work/omniagent-r05-owner-inventory.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077
container="$(printf '%s' 'amFudXMtcG9zdGdyZXM=' | base64 -d)"
trap 'sudo rm -f /tmp/omniagent-r05-owner-inventory.sh' EXIT
pg() { sudo docker exec -u postgres "$container" psql -X -q -A -t -v ON_ERROR_STOP=1 "$@"; }
db='omniagent_chat'
test "$(pg -d postgres -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$db'")" = 'omniagent_chat_app'
raw="$(pg -d "$db" -c "
BEGIN TRANSACTION READ ONLY;
SET LOCAL ROLE omniagent_chat_app;
WITH owners AS (
  SELECT owner_id FROM omni_chat.owners
  WHERE issuer IN ('https://accounts.google.com','accounts.google.com')
    AND length(subject)>0
)
SELECT json_build_object(
 'oauth_backed_mappings',(SELECT count(*) FROM owners),
 'owners_with_threads',(SELECT count(DISTINCT t.owner_id) FROM omni_chat.threads t JOIN owners o ON o.owner_id=t.owner_id),
 'owners_with_events',(SELECT count(DISTINCT e.owner_id) FROM omni_chat.events e JOIN owners o ON o.owner_id=e.owner_id)
);
COMMIT;
")"
python3 -c '
import json,sys
lines=[x.strip() for x in sys.stdin if x.strip()]
if len(lines)!=1: raise SystemExit("r05_inventory=INVALID_OUTPUT")
d=json.loads(lines[0])
keys=("oauth_backed_mappings","owners_with_threads","owners_with_events")
if set(d)!=set(keys) or any(type(d[k]) is not int or d[k]<0 for k in keys):
    raise SystemExit("r05_inventory=INVALID_COUNTERS")
if not d["oauth_backed_mappings"]>=d["owners_with_threads"]>=d["owners_with_events"]:
    raise SystemExit("r05_inventory=INCONSISTENT_COUNTERS")
for k in keys: print("r05_"+k+"="+str(d[k]))
print("r05_db_read_only=PASS_OWN_LOGICAL_DATABASE")
print("r05_db_has_two_oauth_mappings="+("YES_NOT_E2E" if d[keys[0]]>=2 else "NO"))
print("r05_two_user_oauth_api_e2e=NOT_VERIFIED_NO_DELEGATED_USER_TOKENS")
' <<< "$raw"
REMOTE
chmod 700 "$work/omniagent-r05-owner-inventory.sh"
gcloud compute scp "$work/omniagent-r05-owner-inventory.sh" "$HOST:/tmp/" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet >/dev/null
gcloud compute ssh "$HOST" --project="$PROJECT" --zone="$ZONE" \
  --tunnel-through-iap --quiet \
  --command='sudo bash /tmp/omniagent-r05-owner-inventory.sh'
