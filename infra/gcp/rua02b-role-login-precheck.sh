#!/usr/bin/env bash
# One-shot telemetry role setup; called after the checked database preflight.
set -euo pipefail
set +x
umask 077
C=janus-postgres
pg(){ sudo docker exec -u postgres "$C" psql -X -q -v ON_ERROR_STOP=1 -d postgres "$@"; }
for kind in reader writer; do
  name="omniagent_usage_$kind"
  login="$(sudo docker exec -u postgres "$C" psql -X -A -t -v ON_ERROR_STOP=1 -d postgres -c "SELECT rolcanlogin FROM pg_roles WHERE rolname='$name'")"
  [[ "$login" == f ]] || exit 3
done
echo "rua02b_role_login_precondition=PASS"
