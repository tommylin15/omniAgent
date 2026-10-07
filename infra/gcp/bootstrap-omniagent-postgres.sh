#!/usr/bin/env bash
set -euo pipefail
umask 077

PROJECT_ID="${OMNIAGENT_GCP_PROJECT_ID:-gen-lang-client-0593591102}"
DB_SECRET="${OMNIAGENT_CHAT_DB_SECRET:-omniagent-chat-db}"
HOST_PORT="${OMNIAGENT_POSTGRES_HOST_PORT:-5432}"
: "${OMNIAGENT_POSTGRES_HOST_VM:?OMNIAGENT_POSTGRES_HOST_VM is required}"
: "${OMNIAGENT_POSTGRES_HOST_ZONE:?OMNIAGENT_POSTGRES_HOST_ZONE is required}"
: "${OMNIAGENT_POSTGRES_CONTAINER:?OMNIAGENT_POSTGRES_CONTAINER is required}"

gcloud config set project "$PROJECT_ID" >/dev/null

instance_json="$(mktemp)"
work="$(mktemp -d)"
trap 'rm -f "$instance_json"; rm -rf "$work"' EXIT

gcloud compute instances describe "$OMNIAGENT_POSTGRES_HOST_VM" \
  --zone="$OMNIAGENT_POSTGRES_HOST_ZONE" \
  --project="$PROJECT_ID" \
  --format=json >"$instance_json"

read -r host_ip subnet < <(python3 - "$instance_json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
ni=(d.get("networkInterfaces") or [{}])[0]
ip=ni.get("networkIP","")
subnet=ni.get("subnetwork","").rsplit("/",1)[-1]
if not ip or not subnet:
    raise SystemExit("PostgreSQL host network metadata is incomplete")
print(ip,subnet)
PY
)
host_region="${OMNIAGENT_POSTGRES_HOST_ZONE%-*}"
subnet_cidr="$(gcloud compute networks subnets describe "$subnet" \
  --region="$host_region" \
  --project="$PROJECT_ID" \
  --format='value(ipCidrRange)')"
test -n "$subnet_cidr"

secret_has_version=false
if gcloud secrets versions access latest \
    --secret="$DB_SECRET" \
    --project="$PROJECT_ID" >"$work/existing-dsn" 2>/dev/null; then
  secret_has_version=true
  python3 - "$work/existing-dsn" "$host_ip" "$HOST_PORT" "$work/app-password" <<'PY'
import sys
from urllib.parse import unquote,urlparse
raw=open(sys.argv[1],encoding="utf-8").read().strip()
u=urlparse(raw)
if u.scheme not in ("postgresql","postgres"):
    raise SystemExit("DB secret is not a PostgreSQL URL")
if u.username!="omniagent_chat_app" or (u.path or "").lstrip("/")!="omniagent_chat":
    raise SystemExit("DB secret identity mismatch")
if u.hostname!=sys.argv[2] or (u.port or 5432)!=int(sys.argv[3]):
    raise SystemExit("DB secret endpoint mismatch")
password=unquote(u.password or "")
if len(password)!=64 or any(c not in "0123456789abcdef" for c in password):
    raise SystemExit("DB secret password contract is invalid")
open(sys.argv[4],"w",encoding="utf-8").write(password)
PY
else
  openssl rand -hex 32 >"$work/app-password"
fi
chmod 600 "$work/app-password"

cat >"$work/remote-bootstrap.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077

container="$1"
secret_has_version="$2"
subnet_cidr="$3"
app_password_file=/tmp/omniagent-app-password
migration_001=/tmp/omniagent-001.sql
migration_002=/tmp/omniagent-002.sql
backup_dir=/mnt/stateful_partition/omniagent-shared-postgres
trap 'sudo rm -f "$app_password_file" "$migration_001" "$migration_002" /tmp/omniagent-remote-bootstrap.sh /tmp/omniagent-pg-hba /tmp/omniagent-pg-hba.new' EXIT

app_password="$(<"$app_password_file")"
[[ "$app_password" =~ ^[0-9a-f]{64}$ ]]
[[ "$subnet_cidr" =~ ^[0-9a-fA-F:.]+/[0-9]{1,3}$ ]]

sudo docker inspect "$container" >/dev/null
pg() { sudo docker exec -u postgres "$container" psql -v ON_ERROR_STOP=1 "$@"; }
pg -Atqc 'SELECT current_setting('"'"'server_version'"'"')' >/dev/null

role_exists="$(pg -Atqc "SELECT 1 FROM pg_roles WHERE rolname='omniagent_chat_app'")"
db_exists="$(pg -Atqc "SELECT 1 FROM pg_database WHERE datname='omniagent_chat'")"

if [[ -z "$role_exists" ]]; then
  printf "SET log_min_error_statement = PANIC;\nCREATE ROLE omniagent_chat_app LOGIN PASSWORD '%s';\n" "$app_password" |
    sudo docker exec -i -u postgres "$container" psql -v ON_ERROR_STOP=1 >/dev/null
elif [[ "$secret_has_version" != true ]]; then
  echo "role exists but DB secret has no version; refusing credential guess/rotation" >&2
  exit 31
fi

if [[ -z "$db_exists" ]]; then
  pg -c 'CREATE DATABASE omniagent_chat OWNER omniagent_chat_app' >/dev/null
else
  owner="$(pg -Atqc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='omniagent_chat'")"
  [[ "$owner" == "omniagent_chat_app" ]]
fi

for migration in "$migration_001" "$migration_002"; do
  {
    printf 'SET ROLE omniagent_chat_app;\n'
    cat "$migration"
  } | sudo docker exec -i -u postgres "$container" \
        psql -v ON_ERROR_STOP=1 -1 -d omniagent_chat >/dev/null
done

role_ok="$(pg -Atqc "SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='omniagent_chat_app'")"
[[ "$role_ok" == "t" ]]
schema_owner="$(pg -d omniagent_chat -Atqc "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='omni_chat'")"
[[ "$schema_owner" == "omniagent_chat_app" ]]
table_count="$(pg -d omniagent_chat -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname='omni_chat'")"
[[ "$table_count" == "7" ]]

sudo docker exec -e PGPASSWORD="$app_password" "$container" \
  psql -v ON_ERROR_STOP=1 -U omniagent_chat_app -d omniagent_chat >/dev/null <<'SQL'
BEGIN;
INSERT INTO omni_chat.owners(owner_id,issuer,subject)
VALUES ('00000000-0000-0000-0000-000000000001','bootstrap-probe','bootstrap-probe')
ON CONFLICT DO NOTHING;
SELECT 1;
ROLLBACK;
SQL

hba_path="$(pg -Atqc 'SHOW hba_file')"
test -n "$hba_path"
expected_rule="hostssl omniagent_chat omniagent_chat_app $subnet_cidr scram-sha-256"
existing_rule="$(sudo docker exec -u postgres "$container" sh -c \
  'grep -E "^[[:space:]]*host(ss?l)?[[:space:]]+omniagent_chat[[:space:]]+omniagent_chat_app[[:space:]]" "$1" || true' \
  sh "$hba_path")"

if [[ -n "$existing_rule" ]]; then
  normalized="$(printf '%s\n' "$existing_rule" | awk '{$1=$1; print}')"
  [[ "$normalized" == "$expected_rule" ]] || {
    echo "existing omniAgent pg_hba rule drift detected" >&2
    exit 34
  }
else
  sudo mkdir -p "$backup_dir"
  if [[ ! -f "$backup_dir/pg_hba.conf.pre-omniagent" ]]; then
    sudo docker cp "$container:$hba_path" "$backup_dir/pg_hba.conf.pre-omniagent"
  fi
  printf '%s\n' "$expected_rule" | sudo tee "$backup_dir/omniagent-pg_hba.rule" >/dev/null

  sudo docker exec -u postgres "$container" cat "$hba_path" >/tmp/omniagent-pg-hba
  awk -v rule="$expected_rule" '
    BEGIN { inserted=0 }
    {
      if (!inserted && $1=="host" && $2=="all" && $3=="all" &&
          ($4=="0.0.0.0/0" || $4=="0.0.0.0") && $5=="reject") {
        print rule
        inserted=1
      }
      print
    }
    END { if (!inserted) exit 42 }
  ' /tmp/omniagent-pg-hba >/tmp/omniagent-pg-hba.new

  sudo docker cp /tmp/omniagent-pg-hba.new "$container:$hba_path"
  sudo docker exec -u root "$container" chown postgres:postgres "$hba_path"
  sudo docker exec -u root "$container" chmod 600 "$hba_path"
fi

pg -Atqc 'SELECT pg_reload_conf()' | grep -qx t
hba_ok="$(pg -Atqc "SELECT count(*) FROM pg_hba_file_rules WHERE database @> ARRAY['omniagent_chat'] AND user_name @> ARRAY['omniagent_chat_app'] AND auth_method='scram-sha-256' AND error IS NULL")"
[[ "$hba_ok" -ge 1 ]]

echo "postgres_runtime=READY"
echo "postgres_tables=$table_count"
echo "postgres_hba=READY"
REMOTE

chmod 700 "$work/remote-bootstrap.sh"
gcloud compute scp \
  "$work/remote-bootstrap.sh" \
  "$work/app-password" \
  infra/postgres/migrations/001_chat_ownership.sql \
  infra/postgres/migrations/002_skill_storage.sql \
  "$OMNIAGENT_POSTGRES_HOST_VM:/tmp/" \
  --zone="$OMNIAGENT_POSTGRES_HOST_ZONE" \
  --project="$PROJECT_ID" \
  --tunnel-through-iap \
  --quiet

gcloud compute ssh "$OMNIAGENT_POSTGRES_HOST_VM" \
  --zone="$OMNIAGENT_POSTGRES_HOST_ZONE" \
  --project="$PROJECT_ID" \
  --tunnel-through-iap \
  --quiet \
  --command \
  "sudo mv /tmp/remote-bootstrap.sh /tmp/omniagent-remote-bootstrap.sh; \
   sudo mv /tmp/app-password /tmp/omniagent-app-password; \
   sudo mv /tmp/001_chat_ownership.sql /tmp/omniagent-001.sql; \
   sudo mv /tmp/002_skill_storage.sql /tmp/omniagent-002.sql; \
   sudo chmod 600 /tmp/omniagent-app-password /tmp/omniagent-001.sql /tmp/omniagent-002.sql; \
   sudo chmod 700 /tmp/omniagent-remote-bootstrap.sh; \
   sudo bash /tmp/omniagent-remote-bootstrap.sh '$OMNIAGENT_POSTGRES_CONTAINER' '$secret_has_version' '$subnet_cidr'"

if [[ "$secret_has_version" != true ]]; then
  python3 - "$host_ip" "$HOST_PORT" "$work/app-password" "$work/dsn" <<'PY'
import sys
host=sys.argv[1]
port=sys.argv[2]
password=open(sys.argv[3],encoding="utf-8").read().strip()
open(sys.argv[4],"w",encoding="utf-8").write(
    f"postgresql://omniagent_chat_app:{password}@{host}:{port}/omniagent_chat?sslmode=require")
PY
  gcloud secrets versions add "$DB_SECRET" \
    --project="$PROJECT_ID" \
    --data-file="$work/dsn" >/dev/null
fi

echo "postgres_host=$host_ip"
echo "postgres_port=$HOST_PORT"
echo "postgres_database=omniagent_chat"
echo "postgres_role=omniagent_chat_app"
echo "postgres_subnet=$subnet"
echo "postgres_subnet_cidr=$subnet_cidr"
echo "postgres_container=shared"
echo "chat_db_secret=$DB_SECRET"
