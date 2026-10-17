#!/usr/bin/env bash
# Requires root-owned temporary 0600 files: /tmp/rua02b-{writer,reader}.pw.
# Only two names from the checked omniagent_gateway migration are modified.
set -euo pipefail
set +x
umask 077
c=janus-postgres
get(){ sudo docker exec -u postgres "$c" psql -X -A -t -v ON_ERROR_STOP=1 -d postgres -c "$1"; }
for role in writer reader; do
  test "$(get "SELECT (NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)::text FROM pg_roles WHERE rolname='omniagent_usage_$role'")" = true
done
test "$(get "SELECT count(*) FROM pg_database WHERE datname='omniagent_gateway'")" = 1
echo 'rua02b_role_scope=PASS'
