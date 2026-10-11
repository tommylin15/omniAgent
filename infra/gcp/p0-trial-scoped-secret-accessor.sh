#!/usr/bin/env bash
# One bounded IAM grant for the user-approved A1 native Codex trial.
# Never reads secret payload, changes Secret versions, or grants editor/admin.
set -euo pipefail
umask 077
PROJECT='gen-lang-client-0593591102'
SECRET='omniagent-shared-codex-auth'
GATEWAY='omniagent-gateway@gen-lang-client-0593591102.iam.gserviceaccount.com'
MEMBER="serviceAccount:$GATEWAY"
ROLE='roles/secretmanager.secretAccessor'
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 2
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
test "$(git ls-remote https://github.com/tommylin15/omniAgent.git refs/heads/main | cut -f1)" = "$GITHUB_SHA" || {
  echo 'trial_secret_accessor=BLOCKED_STALE_MAIN'
  exit 1
}
actual="$(gcloud run services describe omniagent-agent-gateway \
  --project="$PROJECT" --region=us-central1 \
  --format='value(spec.template.spec.serviceAccountName)')"
test "$actual" = "$GATEWAY" || {
  echo 'trial_secret_accessor=BLOCKED_RUNTIME_IDENTITY_MISMATCH'
  exit 1
}
test "$(gcloud secrets versions describe latest --secret="$SECRET" \
  --project="$PROJECT" --format='value(state)')" = ENABLED || {
  echo 'trial_secret_accessor=BLOCKED_SECRET_VERSION_NOT_ENABLED'
  exit 1
}
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" \
  --format=json > "$work/before.json"
# Not an IAM policy for any other secret, project, folder or organization.
python3 - "$work/before.json" "$MEMBER" <<'PY'
import json,sys
policy=json.load(open(sys.argv[1]))
member=sys.argv[2]
b=[x for x in policy.get("bindings",[]) if
   x.get("role")=="roles/secretmanager.secretAccessor"
   and member in x.get("members",[]) and not x.get("condition")]
print("trial_secret_accessor_existing="+("YES" if b else "NO"))
PY
# CI may not hold Secret Manager IAM administration; a denial is a BLOCKER,
# not a reason to escalate the CI identity to project-level admin.
if ! gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT" \
    --member="$MEMBER" --role="$ROLE" --quiet > "$work/grant.log" 2>&1; then
  echo 'trial_secret_accessor=BLOCKED_CI_IAM_PERMISSION'
  exit 1
fi
gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" \
  --format=json > "$work/after.json"
python3 - "$work/after.json" "$MEMBER" <<'PY'
import json,sys
policy=json.load(open(sys.argv[1]))
member=sys.argv[2]
binding=[x for x in policy.get("bindings",[]) if
         x.get("role")=="roles/secretmanager.secretAccessor"
         and member in x.get("members",[]) and not x.get("condition")]
if not binding:
    raise SystemExit("trial_secret_accessor=FAIL_READBACK")
print("trial_secret_accessor=PASS_SCOPED_READONLY")
print("trial_secret_credential_payload_read=NO")
print("trial_secret_versions_modified=NO")
print("trial_secret_scope=omniagent-shared-codex-auth_ONLY")
PY
