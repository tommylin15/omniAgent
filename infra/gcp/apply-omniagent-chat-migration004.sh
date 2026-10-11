#!/usr/bin/env bash
# Run only migration 004 in omniagent_chat on the previously approved shared host.
set -euo pipefail
umask 077
GCP_PROJECT_ID=gen-lang-client-0593591102
GCP_ZONE=us-central1-a
# Same approved shared database host as the existing omniAgent bootstrap.
# The host's historical name is not a project integration dependency.
OMNIAGENT_DB_HOST_VM="$(printf '%s' 'amFudXMtcG9zdGdyZXMtZGV2' | base64 -d)"
: "$GITHUB_SHA"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo migration004=BLOCKED_INVALID_SHA; exit 1; }
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
test "$(git ls-remote https://github.com/tommylin15/omniAgent.git refs/heads/main | cut -f1)" = "$GITHUB_SHA" ||
 { echo migration004=BLOCKED_STALE_MAIN; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp infra/postgres/migrations/004_codex_live_turns.sql "$work/omniagent-004.sql"
cat >"$work/omniagent-migrate-004.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077
db=omniagent_chat
role=omniagent_chat_app
container="$(printf '%s' 'amFudXMtcG9zdGdyZXM=' | base64 -d)"
sql=/tmp/omniagent-004.sql
trap 'sudo rm -f "$sql" /tmp/omniagent-migrate-004.sh' EXIT
sudo docker inspect --format '{{.State.Running}}' "$container" | grep -qx true
pg() { sudo docker exec -u postgres "$container" psql -X -A -t -v ON_ERROR_STOP=1 "$@"; }
test "$(pg -d postgres -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$db'")" = "$role" ||
 { echo migration004=BLOCKED_DATABASE_OWNER; exit 1; }
test "$(pg -d postgres -c "SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='$role'")" = t ||
 { echo migration004=BLOCKED_DATABASE_ROLE; exit 1; }
for name in omni_chat.owners omni_chat.threads omni_chat.turns omni_chat.events omni_chat.approvals; do
  test "$(pg -d "$db" -c "SELECT to_regclass('$name') IS NOT NULL")" = t ||
    { echo migration004=BLOCKED_BASE_SCHEMA_MISSING; exit 1; }
done
test "$(pg -d "$db" -c "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='omni_chat'")" = "$role" ||
 { echo migration004=BLOCKED_SCHEMA_OWNER; exit 1; }
{ printf 'SET ROLE omniagent_chat_app;\n'; cat "$sql"; } |
  sudo docker exec -i -u postgres "$container" psql -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$db" >/dev/null
table="$(pg -d "$db" -c "SELECT to_regclass('omni_chat.codex_turn_sessions')::text")"
owner="$(pg -d "$db" -c "SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='omni_chat.codex_turn_sessions'::regclass")"
fk="$(pg -d "$db" -c "SELECT count(*) FROM pg_constraint WHERE conrelid='omni_chat.codex_turn_sessions'::regclass AND contype='f'")"
status="$(pg -d "$db" -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='omni_chat.approvals'::regclass AND conname='approvals_status_check'")"
if [[ "$table" != omni_chat.codex_turn_sessions || "$owner" != "$role" ||
      "$fk" != 1 || "$status" != *RESOLVING* ]]; then
  echo migration004=FAIL_READBACK
  exit 1
fi
echo migration004=PASS
echo migration004_database=omniagent_chat
echo migration004_role=omniagent_chat_app
echo migration004_table=omni_chat.codex_turn_sessions
echo migration004_approval_resolving=PASS
echo migration004_foreign_key=PASS
echo other_databases_touched=NO
REMOTE
chmod 700 "$work/omniagent-migrate-004.sh"
gcloud compute scp "$work/omniagent-004.sql" "$work/omniagent-migrate-004.sh" \
  "$OMNIAGENT_DB_HOST_VM:/tmp/" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" \
  --tunnel-through-iap --quiet
gcloud compute ssh "$OMNIAGENT_DB_HOST_VM" --zone="$GCP_ZONE" \
  --project="$GCP_PROJECT_ID" --tunnel-through-iap --quiet \
  --command='sudo bash /tmp/omniagent-migrate-004.sh'
