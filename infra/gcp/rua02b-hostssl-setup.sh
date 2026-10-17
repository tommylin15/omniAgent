#!/usr/bin/env bash
# Scoped hostssl addition only for omniagent_gateway. Backup + rollback.
set -Eeuo pipefail
umask 077
c=janus-postgres
tmp="$(mktemp -d)"
changed=0
done_ok=0
hba=''
pg(){ sudo docker exec -u postgres "$c" psql -X -A -t -v ON_ERROR_STOP=1 -d postgres -c "$1"; }
on_exit(){
  rc=$?
  trap - EXIT
  if [[ "$changed" == 1 && "$done_ok" != 1 ]]; then
    sudo docker cp "$tmp/old" "$c:$hba" || true
    sudo docker exec -u root "$c" chown postgres:postgres "$hba" || true
    sudo docker exec -u root "$c" chmod 600 "$hba" || true
    pg 'SELECT pg_reload_conf()' >/dev/null || true
    echo "RUA02B_HBA_ROLLBACK=ATTEMPTED"
  fi
  rm -rf "$tmp"
  exit "$rc"
}
trap on_exit EXIT
[[ "$(pg 'SHOW ssl')" == on ]] || exit 2
[[ "$(pg "SELECT count(*) FROM pg_database WHERE datname='omniagent_gateway'")" == 1 ]] || exit 3
[[ "$(pg "SELECT count(*) FROM pg_roles WHERE rolname IN ('omniagent_usage_writer','omniagent_usage_reader') AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole")" == 2 ]] || exit 4
[[ "$(pg 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')" == 0 ]] || exit 5
[[ "$(pg "SELECT count(*) FROM pg_hba_file_rules WHERE type='hostssl' AND database @> ARRAY['omniagent_gateway'] AND (user_name @> ARRAY['omniagent_usage_writer'] OR user_name @> ARRAY['omniagent_usage_reader'])")" == 0 ]] || exit 6
hba="$(pg 'SHOW hba_file')"
[[ "$hba" == /* && "$hba" =~ ^/[A-Za-z0-9_./-]+$ ]] || exit 7
sudo docker cp "$c:$hba" "$tmp/old"
mapfile -t nets < <(awk '$1=="hostssl" && $2=="omniagent_chat" && $3=="omniagent_chat_app" && $5=="scram-sha-256" {print $4}' "$tmp/old")
[[ "${#nets[@]}" == 1 ]] || exit 8
cidr="${nets[0]}"
python3 - "$cidr" <<'PY'
import ipaddress,sys
ip=ipaddress.ip_network(sys.argv[1],strict=True)
assert isinstance(ip,ipaddress.IPv4Network)
assert any(ip.subnet_of(ipaddress.ip_network(x)) for x in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'))
PY
dir=/var/backups/omniagent-rua02b
sudo install -d -m 700 "$dir"
sudo install -m 600 "$tmp/old" "$dir/pg_hba.$(date -u +%Y%m%dT%H%M%SZ).backup"
{
  echo '# omniAgent RUA-02B scoped telemetry access'
  for role in writer reader; do
    printf 'hostssl omniagent_gateway omniagent_usage_%s %s scram-sha-256\n' "$role" "$cidr"
    printf 'hostssl omniagent_gateway omniagent_usage_%s 127.0.0.1/32 scram-sha-256\n' "$role"
  done
  cat "$tmp/old"
} >"$tmp/new"
sudo docker cp "$tmp/new" "$c:$hba"
changed=1
sudo docker exec -u root "$c" chown postgres:postgres "$hba"
sudo docker exec -u root "$c" chmod 600 "$hba"
[[ "$(pg 'SELECT pg_reload_conf()')" == t ]] || exit 9
ready=0
for _ in 1 2 3 4 5; do
  e="$(pg 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')"
  n="$(pg "SELECT count(*) FROM pg_hba_file_rules WHERE type='hostssl' AND database @> ARRAY['omniagent_gateway'] AND auth_method='scram-sha-256' AND error IS NULL AND (user_name @> ARRAY['omniagent_usage_writer'] OR user_name @> ARRAY['omniagent_usage_reader'])")"
  a="$(pg "SELECT count(*) FROM pg_hba_file_rules WHERE type='hostssl' AND database @> ARRAY['omniagent_chat'] AND user_name @> ARRAY['omniagent_chat_app'] AND error IS NULL")"
  if [[ "$e" == 0 && "$n" == 4 && "$a" == 1 ]]; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || exit 10
done_ok=1
echo 'RUA02B_HBA=PASS'
echo 'RUA02B_BACKUP=CREATED'
echo 'RUA02B_OTHER_CHAT_RULE=UNCHANGED'
echo 'RUA02B_TLS_LOGIN=NOT_TESTED'
