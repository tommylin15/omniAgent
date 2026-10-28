#!/usr/bin/env bash
# GCP_MCP-04 owner-scoped FIRST PHASE. Only NOLOGIN role + private OAuth table.
# Runs on the existing janus-postgres-dev VM; never reads secrets or data rows.
set -Eeuo pipefail
set +x
umask 077
C=janus-postgres
SOURCE=/tmp/gcp-mcp04-009.sql
TARGET=/tmp/gcp-mcp04-009.sql
pg() { sudo docker exec -u postgres "$C" psql -X -A -t -q -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
  sudo docker exec -u root "$C" rm -f "$TARGET" >/dev/null 2>&1 || true
  rm -f "$SOURCE" /tmp/gcp-mcp04-db-migrate.sh
}
trap cleanup EXIT
test -f "$SOURCE"
test "$(pg -d postgres -c 'SHOW ssl')" = on
[[ "$(pg -d postgres -c 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')" == 0 ]]
[[ "$(pg -d postgres -c "SELECT count(*) FROM pg_database WHERE datname='omniagent_chat'")" == 1 ]]
[[ "$(pg -d omniagent_chat -c "SELECT count(*) FROM pg_namespace WHERE nspname='omni_chat'")" == 1 ]]
before="$(pg -d omniagent_chat -c "SELECT count(*) FROM pg_tables WHERE schemaname='omni_chat'")"
[[ "$before" =~ ^[0-9]+$ && "$before" -gt 0 ]]
role="$(pg -d postgres -c "SELECT rolcanlogin::text || ':' || rolsuper::text || ':' || rolcreatedb::text || ':' || rolcreaterole::text || ':' || rolreplication::text FROM pg_roles WHERE rolname='gcp_mcp_oauth_app'")"
[[ -z "$role" || "$role" == 'false:false:false:false:false' ]] || {
  echo 'gcp_mcp04_role_preflight=BLOCKED'; exit 3;
}
# The dedicated database login/HBA access remains DISABLED in this phase.
test "$(pg -d postgres -c "SELECT count(*) FROM pg_hba_file_rules WHERE type='hostssl' AND database @> ARRAY['omniagent_chat'] AND user_name @> ARRAY['gcp_mcp_oauth_app'] AND error IS NULL")" = 0
sudo docker cp "$SOURCE" "$C:$TARGET"
sudo docker exec -u postgres "$C" psql -X -q -v ON_ERROR_STOP=1 -d omniagent_chat -f "$TARGET" >/dev/null
test "$(pg -d postgres -c "SELECT rolcanlogin::text || ':' || rolsuper::text || ':' || rolcreatedb::text || ':' || rolcreaterole::text || ':' || rolreplication::text FROM pg_roles WHERE rolname='gcp_mcp_oauth_app'")" = 'false:false:false:false:false'
test "$(pg -d omniagent_chat -c "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='gcp_mcp_oauth'")" = postgres
test "$(pg -d omniagent_chat -c "SELECT count(*) FROM pg_tables WHERE schemaname='gcp_mcp_oauth' AND tablename='gcp_mcp_oauth_kv'")" = 1
test "$(pg -d omniagent_chat -c "SELECT count(*) FROM pg_tables WHERE schemaname='omni_chat'")" = "$before"
test "$(pg -d omniagent_chat -c "SELECT count(*) FROM gcp_mcp_oauth.gcp_mcp_oauth_kv")" = 0
test "$(pg -d omniagent_chat -c "SELECT has_schema_privilege('gcp_mcp_oauth_app','omni_chat','USAGE')")" = f
test "$(pg -d omniagent_chat -c "SELECT has_schema_privilege('gcp_mcp_oauth_app','gcp_mcp_oauth','USAGE')")" = t
for perm in SELECT INSERT UPDATE DELETE; do
  test "$(pg -d omniagent_chat -c "SELECT has_table_privilege('gcp_mcp_oauth_app','gcp_mcp_oauth.gcp_mcp_oauth_kv','$perm')")" = t
done
test "$(pg -d postgres -c "SELECT count(*) FROM pg_hba_file_rules WHERE type='hostssl' AND database @> ARRAY['omniagent_chat'] AND user_name @> ARRAY['gcp_mcp_oauth_app'] AND error IS NULL")" = 0
echo 'gcp_mcp04_existing_database=omniagent_chat'
echo 'gcp_mcp04_isolated_schema=PASS'
echo 'gcp_mcp04_dedicated_role=NOLOGIN'
echo 'gcp_mcp04_omni_chat_unchanged=PASS'
echo 'gcp_mcp04_oauth_table_empty=PASS'
echo 'gcp_mcp04_hba_access=DISABLED'
echo 'gcp_mcp04_migration_status=PASS'
