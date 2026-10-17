#!/usr/bin/env bash
# Read-only TLS + SQL privilege probes, with one rolled-back INSERT.
# Passwords are temporary and NEVER emitted. No upstream Gemini invocation.
set -Eeuo pipefail
set +x
umask 077
dir="$1"
[[ -d "$dir" && -f "$dir/writer.pw" && -f "$dir/reader.pw" && -f "$dir/ca.pem" ]]
C=janus-postgres
cleanup(){
  sudo docker exec -u root "$C" rm -f /tmp/rua02b-probe-ca.pem >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT
sudo docker cp "$dir/ca.pem" "$C:/tmp/rua02b-probe-ca.pem"
sudo docker exec -u root "$C" chown postgres:postgres /tmp/rua02b-probe-ca.pem
sudo docker exec -u root "$C" chmod 600 /tmp/rua02b-probe-ca.pem
pg(){
  local role="$1"
  shift
  local pw
  pw="$(cat "$dir/$role.pw")"
  sudo docker exec -u postgres \
    -e PGHOST=janus-postgres-dev -e PGHOSTADDR=127.0.0.1 \
    -e PGPORT=5432 -e PGDATABASE=omniagent_gateway \
    -e "PGUSER=omniagent_usage_$role" -e "PGPASSWORD=$pw" \
    -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/tmp/rua02b-probe-ca.pem \
    "$C" psql -X -A -t -v ON_ERROR_STOP=1 "$@"
}
[[ "$(pg reader -c 'SELECT 1')" == 1 ]]
[[ "$(pg writer -c 'SELECT 1')" == 1 ]]
[[ "$(pg reader -c 'SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')" == t ]]
echo 'RUA02B_TLS_VERIFY_FULL=PASS'
if sudo docker exec -u postgres \
  -e PGHOST=untrusted.example.invalid -e PGHOSTADDR=127.0.0.1 \
  -e PGPORT=5432 -e PGDATABASE=omniagent_gateway \
  -e PGUSER=omniagent_usage_reader -e "PGPASSWORD=$(cat "$dir/reader.pw")" \
  -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/tmp/rua02b-probe-ca.pem \
  "$C" psql -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'RUA02B_TLS_WRONG_HOST=FAIL'
  exit 11
fi
echo 'RUA02B_TLS_WRONG_HOST=PASS'
if sudo docker exec -u postgres \
  -e PGHOST=janus-postgres-dev -e PGHOSTADDR=127.0.0.1 \
  -e PGPORT=5432 -e PGDATABASE=omniagent_gateway \
  -e PGUSER=omniagent_usage_reader -e PGPASSWORD=invalid \
  -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/tmp/rua02b-probe-ca.pem \
  "$C" psql -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'RUA02B_WRONG_PASSWORD=FAIL'
  exit 12
fi
echo 'RUA02B_WRONG_PASSWORD=PASS'
pg writer -c "BEGIN; INSERT INTO omni_gateway.router_usage_events (execution_id,project,owner_id,request_id,model,status,provider_tokens,duration_ms) VALUES ('00000000-0000-4000-8000-000000000005','omniagent','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','gemini-flash-lite','completed',0,1); ROLLBACK;" >/dev/null
[[ "$(pg reader -c 'SELECT count(*) FROM omni_gateway.router_usage_events')" == 0 ]]
echo 'RUA02B_WRITER_INSERT_ROLLBACK=PASS'
if pg writer -c 'SELECT count(*) FROM omni_gateway.router_usage_events' >/dev/null 2>&1; then
  echo 'RUA02B_WRITER_SELECT_DENY=FAIL'
  exit 13
fi
echo 'RUA02B_WRITER_SELECT_DENY=PASS'
if pg reader -c "INSERT INTO omni_gateway.router_usage_events (execution_id,project,owner_id,request_id,model,status,duration_ms) VALUES ('00000000-0000-4000-8000-000000000007','omniagent','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','gemini-flash-lite','failed',1)" >/dev/null 2>&1; then
  echo 'RUA02B_READER_INSERT_DENY=FAIL'
  exit 14
fi
echo 'RUA02B_READER_INSERT_DENY=PASS'
echo 'RUA02B_TLS_AND_SQL=PASS'
