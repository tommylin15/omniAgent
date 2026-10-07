#!/usr/bin/env bash
set -euo pipefail

password_file="$1"
migrations_dir="$2"
: "${OMNIAGENT_POSTGRES_CONTAINER:?OMNIAGENT_POSTGRES_CONTAINER is required}"
postgres_container="$OMNIAGENT_POSTGRES_CONTAINER"
test -f "$password_file"
test -f "$migrations_dir/001_chat_ownership.sql"
test -f "$migrations_dir/002_skill_storage.sql"

pg() { sudo docker exec -u postgres "$postgres_container" psql -v ON_ERROR_STOP=1 "$@"; }
test -z "$(pg -Atqc "SELECT 1 FROM pg_roles WHERE rolname='omniagent_chat_app'")"
test -z "$(pg -Atqc "SELECT 1 FROM pg_database WHERE datname='omniagent_chat'")"
password="$(<"$password_file")"
[[ "$password" =~ ^[0-9a-f]{64}$ ]]
printf "SET log_min_error_statement = PANIC;\nCREATE ROLE omniagent_chat_app LOGIN PASSWORD '%s';\n" "$password" |
  sudo docker exec -i -u postgres "$postgres_container" psql -v ON_ERROR_STOP=1 >/dev/null
unset password
pg -c 'CREATE DATABASE omniagent_chat OWNER omniagent_chat_app' >/dev/null
for migration in 001_chat_ownership.sql 002_skill_storage.sql; do
  { printf 'SET ROLE omniagent_chat_app;\n'; cat "$migrations_dir/$migration"; } |
    sudo docker exec -i -u postgres "$postgres_container" psql -v ON_ERROR_STOP=1 -1 -d omniagent_chat >/dev/null
done
pg -d omniagent_chat -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname='omni_chat'"
