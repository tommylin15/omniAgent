#!/usr/bin/env bash
# Enroll exactly one OAuth-verified Owner for 3 Codex starts. No reset.
set -euo pipefail
umask 077
PROJECT=gen-lang-client-0593591102
ZONE=us-central1-a
HOST="$(printf '%s' 'amFudXMtcG9zdGdyZXMtZGV2' | base64 -d)"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
test "$(git rev-parse HEAD)" = "$GITHUB_SHA" || exit 2
test "$(git ls-remote https://github.com/tommylin15/omniAgent.git refs/heads/main | cut -f1)" = "$GITHUB_SHA" || exit 2
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat >"$work/omniagent-p0-trial-enroll.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077
db=omniagent_chat
role=omniagent_chat_app
container="$(printf '%s' 'amFudXMtcG9zdGdyZXM=' | base64 -d)"
expected='bd46f8f29ba78faaa606f03d6a760c1726ce27a7cd75381d5c04b9525861f70f'
trap 'sudo rm -f /tmp/omniagent-p0-trial-enroll.sh' EXIT
trap 'echo trial_enrollment=BLOCKED_REMOTE_EXECUTION' ERR
pg() { sudo docker exec -u postgres "$container" psql -X -A -t -v ON_ERROR_STOP=1 "$@"; }
test "$(pg -d postgres -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$db'")" = "$role" || {
  echo 'trial_enrollment=BLOCKED_WRONG_DATABASE'
  exit 1
}
test "$(pg -d "$db" -c "SELECT to_regclass('omni_chat.codex_trial_budgets') IS NOT NULL")" = t || {
  echo 'trial_enrollment=BLOCKED_MIGRATION005_MISSING'
  exit 1
}
owner=''
found=0
while IFS= read -r row; do
  [[ -n "$row" ]] || continue
  if [[ "$(printf '%s' "$row" | sha256sum | cut -d' ' -f1)" == "$expected" ]]; then
    owner="$row"
    found=$((found+1))
  fi
done < <(pg -d "$db" -c "SELECT owner_id FROM omni_chat.owners WHERE issuer<>'' AND subject<>''")
if [[ "$found" != 1 || ! "$owner" =~ ^[0-9a-f-]{36}$ ]]; then
  echo 'trial_enrollment=BLOCKED_OWNER_IDENTITY'
  exit 1
fi
# No conflict update: reruns cannot reset spent allowances or extend expiry.
{ printf 'SET ROLE omniagent_chat_app;\n'
  printf 'INSERT INTO omni_chat.codex_trial_budgets(owner_id,max_turns,expires_at) VALUES('
  printf "'%s',3,now()+interval '12 hours')" "$owner"
  printf ' ON CONFLICT(owner_id) DO NOTHING;\n'
} | sudo docker exec -i -u postgres "$container" psql -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$db" >/dev/null
state="$(pg -d "$db" -c "SELECT consumed_turns::text || ':' || max_turns::text || ':' || (expires_at>now())::text FROM omni_chat.codex_trial_budgets WHERE owner_id='$owner'")"
[[ "$state" =~ ^[0-3]:3:(t|true)$ ]] || { echo 'trial_enrollment=BLOCKED_BUDGET'; exit 1; }
echo 'trial_enrollment=PASS_NO_RESET'
echo "trial_budget_used=$(printf '%s' "$state" | cut -d: -f1)"
echo 'trial_budget_max=3'
echo 'trial_budget_expiry=UP_TO_12_HOURS'
echo "owner_id=$owner"
REMOTE
chmod 700 "$work/omniagent-p0-trial-enroll.sh"
gcloud compute scp "$work/omniagent-p0-trial-enroll.sh" "$HOST:/tmp/" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet
gcloud compute ssh "$HOST" --project="$PROJECT" --zone="$ZONE" \
  --tunnel-through-iap --quiet --command='sudo bash /tmp/omniagent-p0-trial-enroll.sh'
