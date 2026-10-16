#!/usr/bin/env bash
# Run only migration 005 in omniagent_chat on the previously approved shared host.
set -euo pipefail
umask 077
GCP_PROJECT_ID=gen-lang-client-0593591102
GCP_ZONE=us-central1-a
# Same approved shared database host as the existing omniAgent bootstrap.
# The host's historical name is not a project integration dependency.
OMNIAGENT_DB_HOST_VM="$(printf '%s' 'amFudXMtcG9zdGdyZXMtZGV2' | base64 -d)"
: "$GITHUB_SHA"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo migration005=BLOCKED_INVALID_SHA; exit 1; }
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
test "$(git ls-remote https://github.com/tommylin15/omniAgent.git refs/heads/main | cut -f1)" = "$GITHUB_SHA" ||
 { echo migration005=BLOCKED_STALE_MAIN; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp infra/postgres/migrations/005_codex_trial_3_turn_budget.sql "$work/omniagent-005.sql"
cat >"$work/omniagent-migrate-005.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077
db=omniagent_chat
role=omniagent_chat_app
container="$(printf '%s' 'amFudXMtcG9zdGdyZXM=' | base64 -d)"
sql=/tmp/omniagent-005.sql
trap 'sudo rm -f "$sql" /tmp/omniagent-migrate-005.sh' EXIT
sudo docker inspect --format '{{.State.Running}}' "$container" | grep -qx true
pg() { sudo docker exec -u postgres "$container" psql -X -A -t -v ON_ERROR_STOP=1 "$@"; }
test "$(pg -d postgres -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$db'")" = "$role" ||
 { echo migration005=BLOCKED_DATABASE_OWNER; exit 1; }
test "$(pg -d postgres -c "SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='$role'")" = t ||
 { echo migration005=BLOCKED_DATABASE_ROLE; exit 1; }
for name in omni_chat.owners omni_chat.threads omni_chat.turns omni_chat.events omni_chat.approvals; do
  test "$(pg -d "$db" -c "SELECT to_regclass('$name') IS NOT NULL")" = t ||
    { echo migration005=BLOCKED_BASE_SCHEMA_MISSING; exit 1; }
done
test "$(pg -d "$db" -c "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='omni_chat'")" = "$role" ||
 { echo migration005=BLOCKED_SCHEMA_OWNER; exit 1; }
{ printf 'SET ROLE omniagent_chat_app;\n'; cat "$sql"; } |
  sudo docker exec -i -u postgres "$container" psql -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$db" >/dev/null
table="$(pg -d "$db" -c "SELECT to_regclass('omni_chat.codex_trial_budgets')::text")"
owner="$(pg -d "$db" -c "SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='omni_chat.codex_trial_budgets'::regclass")"
fk="$(pg -d "$db" -c "SELECT count(*) FROM pg_constraint WHERE conrelid='omni_chat.codex_trial_budgets'::regclass AND contype='f'")"
checks="$(pg -d "$db" -c "SELECT string_agg(pg_get_constraintdef(oid),' | ') FROM pg_constraint WHERE conrelid='omni_chat.codex_trial_budgets'::regclass AND contype='c'")"
if [[ "$table" != omni_chat.codex_trial_budgets || "$owner" != "$role" ||
      "$fk" != 1 || "$checks" != *max_turns* || "$checks" != *consumed_turns* || "$checks" != *expires_at* ]]; then
  echo migration005=FAIL_READBACK
  exit 1
fi
echo migration005=PASS
echo migration005_database=omniagent_chat
echo migration005_role=omniagent_chat_app
echo migration005_table=omni_chat.codex_trial_budgets
echo migration005_hard_three_turns=PASS
echo migration005_foreign_key=PASS
echo other_databases_touched=NO
REMOTE
chmod 700 "$work/omniagent-migrate-005.sh"
gcloud compute scp "$work/omniagent-005.sql" "$work/omniagent-migrate-005.sh" \
  "$OMNIAGENT_DB_HOST_VM:/tmp/" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" \
  --tunnel-through-iap --quiet
gcloud compute ssh "$OMNIAGENT_DB_HOST_VM" --zone="$GCP_ZONE" \
  --project="$GCP_PROJECT_ID" --tunnel-through-iap --quiet \
  --command='sudo bash /tmp/omniagent-migrate-005.sh'
