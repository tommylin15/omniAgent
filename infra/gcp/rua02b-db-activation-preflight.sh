#!/usr/bin/env bash
# Activates ONLY the two pre-created omniagent telemetry database roles.
# Prepared by RUA-02B DB workflow; role secrets are read from guarded files.
set -euo pipefail
set +x
umask 077
C=janus-postgres
pg() { sudo docker exec -u postgres "$C" psql -X -A -t -v ON_ERROR_STOP=1 "$@"; }
pg -d postgres -c "SELECT current_setting('ssl')" | grep -qx on
pg -d postgres -c "SELECT count(*) FROM pg_database WHERE datname='omniagent_gateway'" | grep -qx 1
pg -d omniagent_gateway -c "SELECT count(*) FROM omni_gateway.router_usage_events" | grep -qx 0
for role in omniagent_usage_reader omniagent_usage_writer; do
  pg -d postgres -c "SELECT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication)::text FROM pg_roles WHERE rolname='$role'" | grep -qx false
done
echo 'rua02b_role_preflight=PASS'
