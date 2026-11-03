#!/usr/bin/env bash
# Explicit authenticated manual tick; never installs a scheduler or enables a resource.
set -euo pipefail
: "${AGENT_JOBS_TICK_URL:?approved existing worker origin required}"
: "${AGENT_JOBS_AUDIENCE:?configured canonical worker audience required}"
: "${AGENT_JOBS_CALLER_SERVICE_ACCOUNT:?approved invoker service account required}"
[[ "$AGENT_JOBS_TICK_URL" =~ ^https://[a-z0-9.-]+\.run\.app$ ]]
[[ "$AGENT_JOBS_AUDIENCE" =~ ^https://[a-z0-9.-]+\.run\.app$ ]]
[[ "$AGENT_JOBS_CALLER_SERVICE_ACCOUNT" =~ ^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$ ]]
identity_token="$(gcloud auth print-identity-token --impersonate-service-account "$AGENT_JOBS_CALLER_SERVICE_ACCOUNT" --audiences "$AGENT_JOBS_AUDIENCE" --include-email)"
# Feed credentials through stdin rather than curl's process arguments.
printf 'header = "Authorization: Bearer %s"\n' "$identity_token" | \
  curl --config - --fail-with-body --silent --show-error --max-time 300 \
    --request POST --header 'Content-Type: application/json' --data '{"maxJobs":1}' \
    "$AGENT_JOBS_TICK_URL/internal/jobs/tick"
unset identity_token
