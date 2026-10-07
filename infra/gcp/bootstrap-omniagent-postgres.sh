#!/usr/bin/env bash
set -euo pipefail
umask 077

PROJECT_ID="${OMNIAGENT_GCP_PROJECT_ID:-gen-lang-client-0593591102}"
REGION="${OMNIAGENT_GCP_REGION:-us-central1}"
ARTIFACT_REPOSITORY="${OMNIAGENT_ARTIFACT_REPOSITORY:-omniagent}"
DB_SECRET="${OMNIAGENT_CHAT_DB_SECRET:-omniagent-chat-db}"
CONTAINER="${OMNIAGENT_POSTGRES_CONTAINER:-omniagent-postgres}"
HOST_PORT="${OMNIAGENT_POSTGRES_HOST_PORT:-5433}"

: "${OMNIAGENT_POSTGRES_HOST_VM:?OMNIAGENT_POSTGRES_HOST_VM is required}"
: "${OMNIAGENT_POSTGRES_HOST_ZONE:?OMNIAGENT_POSTGRES_HOST_ZONE is required}"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud secrets describe "$DB_SECRET" --project="$PROJECT_ID" >/dev/null

host_ip="$(gcloud compute instances describe "$OMNIAGENT_POSTGRES_HOST_VM"   --zone="$OMNIAGENT_POSTGRES_HOST_ZONE"   --project="$PROJECT_ID"   --format='value(networkInterfaces[0].networkIP)')"
test -n "$host_ip"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

secret_has_version=false
if gcloud secrets versions access latest --secret="$DB_SECRET" --project="$PROJECT_ID"     >"$work/existing-dsn" 2>/dev/null; then
  secret_has_version=true
  python3 - "$work/existing-dsn" "$host_ip" "$HOST_PORT" "$work/app-password" <<'PY'
import sys
from urllib.parse import unquote, urlparse
raw=open(sys.argv[1], encoding="utf-8").read().strip()
u=urlparse(raw)
if u.scheme not in ("postgresql","postgres"):
    raise SystemExit("DB secret is not a PostgreSQL URL")
if u.username != "omniagent_chat_app" or (u.path or "").lstrip("/") != "omniagent_chat":
    raise SystemExit("DB secret identity mismatch")
if u.hostname != sys.argv[2] or (u.port or 5432) != int(sys.argv[3]):
    raise SystemExit("DB secret endpoint mismatch")
password=unquote(u.password or "")
if len(password) != 64 or any(c not in "0123456789abcdef" for c in password):
    raise SystemExit("DB secret password contract is invalid")
open(sys.argv[4],"w",encoding="utf-8").write(password)
PY
else
  openssl rand -hex 32 >"$work/app-password"
fi
openssl rand -hex 32 >"$work/bootstrap-password"
chmod 600 "$work/app-password" "$work/bootstrap-password"

tag="${GITHUB_SHA:-manual-$(date -u +%Y%m%d%H%M%S)}"
image_tag="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/omniagent-postgres:${tag}"

gcloud builds submit infra/postgres   --tag "$image_tag"   --project="$PROJECT_ID"   --quiet

digest="$(gcloud artifacts docker images describe "$image_tag"   --project="$PROJECT_ID"   --format='value(image_summary.digest)')"
test -n "$digest"
image_ref="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/omniagent-postgres@${digest}"

cat >"$work/remote-bootstrap.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077
image_ref="$1"
container="$2"
host_port="$3"
secret_has_version="$4"
data_dir=/mnt/stateful_partition/omniagent-postgres
app_password_file=/tmp/omniagent-app-password
bootstrap_password_file=/tmp/omniagent-bootstrap-password
trap 'sudo rm -f "$app_password_file" "$bootstrap_password_file" /tmp/omniagent-remote-bootstrap.sh' EXIT

app_password="$(<"$app_password_file")"
bootstrap_password="$(<"$bootstrap_password_file")"
[[ "$app_password" =~ ^[0-9a-f]{64}$ ]]
[[ "$bootstrap_password" =~ ^[0-9a-f]{64}$ ]]

token="$(curl -fsS -H 'Metadata-Flavor: Google'   'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'   | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
sudo mkdir -p /run/omniagent-docker
printf '%s' "$token" | sudo docker --config /run/omniagent-docker login   -u oauth2accesstoken --password-stdin us-central1-docker.pkg.dev >/dev/null
unset token
sudo docker --config /run/omniagent-docker pull "$image_ref" >/dev/null
sudo rm -rf /run/omniagent-docker

sudo mkdir -p "$data_dir"
sudo chmod 700 "$data_dir"
sudo docker rm -f "$container" >/dev/null 2>&1 || true

if [[ ! -f "$data_dir/PG_VERSION" ]]; then
  env_file=/run/omniagent-postgres-bootstrap.env
  printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=postgres\nPGDATA=/var/lib/postgresql/data\n' "$bootstrap_password" |
    sudo tee "$env_file" >/dev/null
  sudo docker run -d --name "$container" --restart=no     --env-file "$env_file" -v "$data_dir:/var/lib/postgresql/data" "$image_ref" >/dev/null
  sudo rm -f "$env_file"
else
  sudo docker run -d --name "$container" --restart=no     -v "$data_dir:/var/lib/postgresql/data" "$image_ref" >/dev/null
fi

for _ in $(seq 1 60); do
  sudo docker exec -u postgres "$container" pg_isready -U postgres -d postgres >/dev/null 2>&1 && break
  sleep 1
done
sudo docker exec -u postgres "$container" pg_isready -U postgres -d postgres >/dev/null

role_exists="$(sudo docker exec -u postgres "$container" psql -Atqc   "SELECT 1 FROM pg_roles WHERE rolname='omniagent_chat_app'")"
db_exists="$(sudo docker exec -u postgres "$container" psql -Atqc   "SELECT 1 FROM pg_database WHERE datname='omniagent_chat'")"

if [[ -z "$role_exists" ]]; then
  printf "CREATE ROLE omniagent_chat_app LOGIN PASSWORD '%s';\n" "$app_password" |
    sudo docker exec -i -u postgres "$container" psql -v ON_ERROR_STOP=1 >/dev/null
elif [[ "$secret_has_version" != true ]]; then
  echo "role exists but DB secret has no version; refusing credential guess/rotation" >&2
  exit 31
fi

if [[ -z "$db_exists" ]]; then
  sudo docker exec -u postgres "$container" psql -v ON_ERROR_STOP=1     -c 'CREATE DATABASE omniagent_chat OWNER omniagent_chat_app' >/dev/null
else
  owner="$(sudo docker exec -u postgres "$container" psql -Atqc     "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='omniagent_chat'")"
  [[ "$owner" == "omniagent_chat_app" ]]
fi

for migration in 001_chat_ownership.sql 002_skill_storage.sql; do
  {
    printf 'SET ROLE omniagent_chat_app;\n'
    sudo docker exec "$container" cat "/opt/omniagent/migrations/$migration"
  } | sudo docker exec -i -u postgres "$container"         psql -v ON_ERROR_STOP=1 -1 -d omniagent_chat >/dev/null
done

role_ok="$(sudo docker exec -u postgres "$container" psql -Atqc   "SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='omniagent_chat_app'")"
[[ "$role_ok" == "t" ]]
schema_owner="$(sudo docker exec -u postgres "$container" psql -d omniagent_chat -Atqc   "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='omni_chat'")"
[[ "$schema_owner" == "omniagent_chat_app" ]]
table_count="$(sudo docker exec -u postgres "$container" psql -d omniagent_chat -Atqc   "SELECT count(*) FROM pg_tables WHERE schemaname='omni_chat'")"
[[ "$table_count" == "7" ]]

sudo docker exec -e PGPASSWORD="$app_password" "$container"   psql -v ON_ERROR_STOP=1 -U omniagent_chat_app -d omniagent_chat >/dev/null <<'SQL'
BEGIN;
INSERT INTO omni_chat.owners(owner_id,issuer,subject)
VALUES ('00000000-0000-0000-0000-000000000001','bootstrap-probe','bootstrap-probe')
ON CONFLICT DO NOTHING;
SELECT 1;
ROLLBACK;
SQL

if [[ ! -f "$data_dir/server.key" || ! -f "$data_dir/server.crt" ]]; then
  sudo docker exec -u postgres "$container"     openssl req -new -x509 -days 365 -nodes -text     -subj "/CN=omniagent-postgres-dev"     -keyout /var/lib/postgresql/data/server.key     -out /var/lib/postgresql/data/server.crt >/dev/null 2>&1
  sudo docker exec -u postgres "$container" chmod 600 /var/lib/postgresql/data/server.key
fi

sudo docker rm -f "$container" >/dev/null
sudo docker run -d --name "$container" --restart=always   -p "${host_port}:5432"   -v "$data_dir:/var/lib/postgresql/data" "$image_ref"   -c config_file=/opt/omniagent/postgresql.conf   -c hba_file=/opt/omniagent/pg_hba.conf >/dev/null

for _ in $(seq 1 60); do
  sudo docker exec -u postgres "$container" pg_isready -U postgres -d omniagent_chat >/dev/null 2>&1 && break
  sleep 1
done
sudo docker exec -u postgres "$container" pg_isready -U postgres -d omniagent_chat >/dev/null
echo "postgres_runtime=READY"
echo "postgres_tables=$table_count"
REMOTE

chmod 700 "$work/remote-bootstrap.sh"
gcloud compute scp   "$work/remote-bootstrap.sh" "$work/app-password" "$work/bootstrap-password"   "$OMNIAGENT_POSTGRES_HOST_VM:/tmp/"   --zone="$OMNIAGENT_POSTGRES_HOST_ZONE"   --project="$PROJECT_ID"   --tunnel-through-iap --quiet

gcloud compute ssh "$OMNIAGENT_POSTGRES_HOST_VM"   --zone="$OMNIAGENT_POSTGRES_HOST_ZONE"   --project="$PROJECT_ID"   --tunnel-through-iap --quiet   --command   "sudo mv /tmp/remote-bootstrap.sh /tmp/omniagent-remote-bootstrap.sh;    sudo mv /tmp/app-password /tmp/omniagent-app-password;    sudo mv /tmp/bootstrap-password /tmp/omniagent-bootstrap-password;    sudo chmod 600 /tmp/omniagent-app-password /tmp/omniagent-bootstrap-password;    sudo chmod 700 /tmp/omniagent-remote-bootstrap.sh;    sudo /tmp/omniagent-remote-bootstrap.sh '$image_ref' '$CONTAINER' '$HOST_PORT' '$secret_has_version'"

if [[ "$secret_has_version" != true ]]; then
  python3 - "$host_ip" "$HOST_PORT" "$work/app-password" "$work/dsn" <<'PY'
import sys
host=sys.argv[1]
port=sys.argv[2]
password=open(sys.argv[3],encoding="utf-8").read().strip()
open(sys.argv[4],"w",encoding="utf-8").write(
    f"postgresql://omniagent_chat_app:{password}@{host}:{port}/omniagent_chat?sslmode=require")
PY
  gcloud secrets versions add "$DB_SECRET"     --project="$PROJECT_ID"     --data-file="$work/dsn" >/dev/null
fi

echo "postgres_host=$host_ip"
echo "postgres_port=$HOST_PORT"
echo "postgres_database=omniagent_chat"
echo "postgres_role=omniagent_chat_app"
echo "postgres_image_digest=$digest"
echo "chat_db_secret=$DB_SECRET"
