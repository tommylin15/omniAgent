#!/usr/bin/env bash
# Read-only evidence for the single approved omniAgent Owner A Codex trial.
set -euo pipefail
umask 077
PROJECT=gen-lang-client-0593591102
ZONE=us-central1-a
HOST="$(printf '%s' 'amFudXMtcG9zdGdyZXMtZGV2' | base64 -d)"
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 2
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
test "$(git ls-remote https://github.com/tommylin15/omniAgent.git refs/heads/main | cut -f1)" = "$GITHUB_SHA"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat > "$work/omniagent-p0-owner-live-readback.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077
trap 'sudo rm -f /tmp/omniagent-p0-owner-live-readback.sh' EXIT
db=omniagent_chat
container="$(printf '%s' 'amFudXMtcG9zdGdyZXM=' | base64 -d)"
expected_hash=bd46f8f29ba78faaa606f03d6a760c1726ce27a7cd75381d5c04b9525861f70f
readonly_psql() {
  sudo docker exec -i -u postgres "$container" psql -X -A -t -q -v ON_ERROR_STOP=1 -d "$db" "$@"
}
owner=''
matches=0
while IFS= read -r id; do
  [[ -n "$id" ]] || continue
  if [[ "$(printf '%s' "$id" | sha256sum | cut -d' ' -f1)" == "$expected_hash" ]]; then
    [[ "$id" =~ ^[a-f0-9-]{36}$ ]] || exit 2
    owner="$id"
    matches=$((matches+1))
  fi
done < <(sudo docker exec -u postgres "$container" psql -X -A -t -q -v ON_ERROR_STOP=1 -d "$db" -c "SELECT owner_id FROM omni_chat.owners WHERE issuer<>'' AND subject<>''")
if [[ $matches != 1 ]]; then
  echo 'p0_owner_db_identity=BLOCKED'
  exit 1
fi
# Execute only aggregate SELECTs under the actual application role.
result="$(readonly_psql -v owner_id="$owner" <<'SQL'
SET ROLE omniagent_chat_app;
BEGIN READ ONLY;
WITH
identified AS (
  SELECT o.owner_id FROM omni_chat.owners o
  WHERE o.owner_id=:'owner_id'::uuid AND o.issuer<>'' AND o.subject<>''
),
budget AS (
  SELECT b.* FROM omni_chat.codex_trial_budgets b JOIN identified o USING(owner_id)
),
eligible AS (
  SELECT t.owner_id,t.thread_id,t.turn_id,t.status
  FROM omni_chat.turns t
  JOIN omni_chat.threads th ON th.owner_id=t.owner_id AND th.thread_id=t.thread_id
  JOIN identified o ON o.owner_id=t.owner_id
  WHERE th.runtime='codex' AND th.model='gpt-5.6-luna'
    AND t.created_at >= timestamptz '2026-10-11T12:55:00Z'
),
accepted AS (
  SELECT e.owner_id,e.thread_id,e.turn_id FROM eligible e
  WHERE e.status='COMPLETED'
    AND EXISTS (
      SELECT 1 FROM omni_chat.events ev WHERE ev.owner_id=e.owner_id
        AND ev.thread_id=e.thread_id AND ev.turn_id=e.turn_id
        AND ev.event_type='text_delta'
        AND jsonb_typeof(ev.payload->'text')='string'
        AND length(ev.payload->>'text')>0
    )
    AND EXISTS (
      SELECT 1 FROM omni_chat.events ev WHERE ev.owner_id=e.owner_id
        AND ev.thread_id=e.thread_id AND ev.turn_id=e.turn_id
        AND ev.event_type='turn_completed'
    )
),
invalid_scope AS (
  SELECT 1 FROM omni_chat.events ev
  LEFT JOIN omni_chat.turns t ON ev.owner_id=t.owner_id
    AND ev.thread_id=t.thread_id AND ev.turn_id=t.turn_id
  WHERE t.turn_id IS NULL
  UNION ALL
  SELECT 1 FROM omni_chat.codex_turn_sessions s
  LEFT JOIN omni_chat.turns t ON s.owner_id=t.owner_id
    AND s.thread_id=t.thread_id AND s.turn_id=t.turn_id
  WHERE t.turn_id IS NULL
)
SELECT 'p0_owner_db_identity=' ||
  CASE WHEN (SELECT count(*) FROM identified)=1 THEN 'PASS' ELSE 'BLOCKED' END
UNION ALL SELECT 'p0_owner_trial_budget=' ||
  CASE WHEN (SELECT count(*) FROM budget WHERE max_turns=3 AND consumed_turns BETWEEN 1 AND 3)=1
    THEN 'PASS' ELSE 'BLOCKED' END
UNION ALL SELECT 'p0_owner_codex_completed=' ||
  CASE WHEN (SELECT count(*) FROM eligible WHERE status='COMPLETED') BETWEEN 1 AND 3
    THEN 'PASS' ELSE 'BLOCKED' END
UNION ALL SELECT 'p0_owner_text_and_terminal_persisted=' ||
  CASE WHEN (SELECT count(*) FROM accepted) BETWEEN 1 AND 3 THEN 'PASS' ELSE 'BLOCKED' END
UNION ALL SELECT 'p0_owner_db_scope_integrity=' ||
  CASE WHEN NOT EXISTS(SELECT 1 FROM invalid_scope) THEN 'PASS' ELSE 'BLOCKED' END
UNION ALL SELECT 'p0_owner_budget_usage=' ||
  CASE (SELECT min(consumed_turns) FROM budget)
    WHEN 0 THEN 'ZERO' WHEN 1 THEN 'ONE' WHEN 2 THEN 'TWO'
    WHEN 3 THEN 'THREE' ELSE 'MISSING_OR_INVALID' END
UNION ALL SELECT 'p0_owner_recent_turns=' ||
  CASE WHEN (SELECT count(*) FROM eligible)=0 THEN 'ZERO'
       WHEN (SELECT count(*) FROM eligible) BETWEEN 1 AND 3 THEN 'ONE_TO_THREE'
       ELSE 'MANY' END;
ROLLBACK;
SQL
)"
# Emit finite, fixed classifications only. Do not print SQL, IDs or payloads.
for category in p0_owner_budget_usage p0_owner_recent_turns; do
  value="$(printf '%s\n' "$result" | grep -E "^$category=(ZERO|ONE|TWO|THREE|MISSING_OR_INVALID|ONE_TO_THREE|MANY)$" || :)"
  if [[ -n "$value" ]]; then printf '%s\n' "$value"; else printf '%s=UNAVAILABLE\n' "$category"; fi
done
blocked=0
for field in p0_owner_db_identity p0_owner_trial_budget p0_owner_codex_completed p0_owner_text_and_terminal_persisted p0_owner_db_scope_integrity; do
  value="$(printf '%s\n' "$result" | grep -E "^$field=(PASS|BLOCKED)$" || :)"
  if [[ "$value" == "$field=PASS" ]]; then
    printf '%s=PASS\n' "$field"
  else
    printf '%s=BLOCKED\n' "$field"
    blocked=1
  fi
done
if [[ $blocked == 0 ]]; then echo 'p0_owner_db_readonly=PASS'
else echo 'p0_owner_db_readonly=BLOCKED'; fi
echo 'p0_authenticated_owner_b_negative=NOT_VERIFIED_BY_DB_AUDIT'
echo 'p0_provider_calls=ZERO'
exit "$blocked"
REMOTE
chmod 700 "$work/omniagent-p0-owner-live-readback.sh"
gcloud compute scp "$work/omniagent-p0-owner-live-readback.sh" "$HOST:/tmp/" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet
gcloud compute ssh "$HOST" --project="$PROJECT" --zone="$ZONE" \
  --tunnel-through-iap --quiet --command='sudo bash /tmp/omniagent-p0-owner-live-readback.sh' | grep -E '^p0_'
