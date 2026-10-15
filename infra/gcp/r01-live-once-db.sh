#!/usr/bin/env bash
# R01: ONLY the omniagent_chat logical DB, never other databases or models.
# One deterministic source SHA = one synthetic turn = no automatic retries.
set -euo pipefail
umask 077
phase="${1:?phase}"; sha="${2:?SHA}"
[[ "$phase" == prepare || "$phase" == inspect ]] || exit 2
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
container="$(printf '%s' 'amFudXMtcG9zdGdyZXM=' | base64 -d)"
db=omniagent_chat
expected="bd46f8f29ba78faaa606f03d6a760c1726ce27a7cd75381d5c04b9525861f70f"
thread="r01live-${sha:0:12}"
turn="r01turn-${sha:0:12}"
pg(){ sudo docker exec -u postgres "$container" psql -X -A -t -v ON_ERROR_STOP=1 "$@"; }
test "$(pg -d postgres -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$db'")" = omniagent_chat_app
test "$(pg -d "$db" -c "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='omni_chat'")" = omniagent_chat_app
test "$(pg -d "$db" -c "SELECT to_regclass('omni_chat.model_daily_budgets') IS NOT NULL")" = t
owner=""
matches=0
while IFS= read -r candidate; do
  if [[ "$(printf '%s' "$candidate" | sha256sum | cut -d' ' -f1)" == "$expected" ]]; then
    owner="$candidate"; matches=$((matches+1))
  fi
done < <(pg -d "$db" -c "SELECT owner_id FROM omni_chat.owners WHERE issuer <> '' AND subject <> ''")
test "$matches" = 1
[[ "$owner" =~ ^[0-9a-f-]{36}$ ]] || exit 2
if [[ "$phase" == prepare ]]; then
  # This check is intentionally fail-closed even on a previous failed attempt.
  test "$(pg -d "$db" -c "SELECT count(*) FROM omni_chat.threads WHERE thread_id='$thread'")" = 0 || { echo "r01_fixture=ALREADY_ATTEMPTED_NO_RETRY"; exit 9; }
  # A generic dispatch:once must never pick somebody else's pending work.
  test "$(pg -d "$db" -c "SELECT count(*) FROM omni_chat.turns t JOIN omni_chat.threads th USING(owner_id,thread_id) WHERE t.status='QUEUED' AND th.owner_id='$owner' AND th.runtime='gemini'")" = 0 || { echo "r01_fixture=BLOCKED_OTHER_QUEUED"; exit 8; }
  test "$(pg -d "$db" -c "SELECT count(*) FROM omni_chat.turns t JOIN omni_chat.threads th USING(owner_id,thread_id) WHERE t.status='RUNNING' AND th.runtime IN ('gemini','openrouter')")" = 0 || { echo "r01_fixture=BLOCKED_RUNNING_TURNS"; exit 8; }
  prompt="R01 technical integration receipt. Reply with R01_OK."
  thread_input="{\"runtime\":\"gemini\",\"model\":\"gemini-3.5-flash-lite\",\"assistantProfile\":\"default\",\"threadId\":\"$thread\"}"
  thread_digest="sha256:$(printf '%s' "$thread_input" | sha256sum | cut -d' ' -f1)"
  msg_digest="sha256:$(printf '{"content":"%s"}' "$prompt" | sha256sum | cut -d' ' -f1)"
  # No user tokens or provider keys. Synthetic row is permanent acceptance evidence.
  {
    printf 'BEGIN; SET LOCAL ROLE omniagent_chat_app;\n'
    printf "INSERT INTO omni_chat.threads(owner_id,thread_id,runtime,model,assistant_profile,create_key,create_digest) VALUES ('%s'::uuid,'%s','gemini','gemini-3.5-flash-lite','default','%s','%s');\n" "$owner" "$thread" "$thread" "$thread_digest"
    printf "INSERT INTO omni_chat.turns(owner_id,thread_id,turn_id,message_key,message_digest) VALUES ('%s'::uuid,'%s','%s','%s','%s');\n" "$owner" "$thread" "$turn" "$turn" "$msg_digest"
    printf "INSERT INTO omni_chat.events(owner_id,thread_id,turn_id,event_id,seq,event_type,payload) VALUES ('%s'::uuid,'%s','%s','%s',0,'item_upsert',jsonb_build_object('role','user','content','%s'));\n" "$owner" "$thread" "$turn" "$turn" "$prompt"
    echo COMMIT\;
  } | sudo docker exec -i -u postgres "$container" psql -X -q -v ON_ERROR_STOP=1 -d "$db" >/dev/null
  echo "r01_fixture=CREATED_ONCE"
  echo "r01_fixture_scope=ONE_OAUTH_OWNER_OWN_CHAT_DB"
else
  pg -d "$db" -c "
    SELECT json_build_object(
      'status',t.status,
      'text_events',(SELECT count(*) FROM omni_chat.events e WHERE e.owner_id=t.owner_id AND e.thread_id=t.thread_id AND e.turn_id=t.turn_id AND e.event_type='text_delta' AND length(btrim(coalesce(e.payload->>'text','')))>0),
      'completed_events',(SELECT count(*) FROM omni_chat.events e WHERE e.owner_id=t.owner_id AND e.thread_id=t.thread_id AND e.turn_id=t.turn_id AND e.event_type='turn_completed'),
      'error_events',(SELECT count(*) FROM omni_chat.events e WHERE e.owner_id=t.owner_id AND e.thread_id=t.thread_id AND e.turn_id=t.turn_id AND e.event_type='turn_error'),
      'closed_at_present',(t.completed_at IS NOT NULL),
      'daily_owner_budget_count',(SELECT coalesce(sum(attempts),0) FROM omni_chat.model_daily_budgets b WHERE b.scope='owner' AND b.owner_id=t.owner_id AND b.utc_day=(now() AT TIME ZONE 'UTC')::date),
      'owner_scope_match',(t.owner_id='$owner'::uuid)
    ) FROM omni_chat.turns t WHERE t.owner_id='$owner'::uuid AND t.thread_id='$thread' AND t.turn_id='$turn';
  "
fi
