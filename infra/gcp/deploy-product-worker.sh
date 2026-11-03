#!/usr/bin/env bash
# Manual source-image deployment. Nothing runs on an ordinary source push.
set -euo pipefail
kind="${1:?usage: deploy-product-worker.sh agent|jobs|archive [--apply]}"
case "$kind" in agent|jobs|archive) ;; *) echo 'invalid worker kind' >&2; exit 2 ;; esac
: "${OMNIAGENT_GCP_PROJECT:?explicit project required}"
: "${OMNIAGENT_GCP_REGION:?explicit region required}"
: "${PRODUCT_WORKER_SERVICE:?explicit service name required}"
: "${PRODUCT_WORKER_SERVICE_ACCOUNT:?explicit runtime identity required}"
: "${PRODUCT_WORKER_IMAGE:?immutable GHCR image digest required}"
: "${PRODUCT_WORKER_ENV_FILE:?approved env file required}"
: "${PRODUCT_WORKER_NETWORK:?existing own network required}"
: "${PRODUCT_WORKER_SUBNET:?existing own subnet required}"
: "${PRODUCT_WORKER_SECRET_BINDINGS:?explicit pinned Secret Manager bindings required}"
: "${PRODUCT_WORKER_TAG:?explicit candidate tag required}"
[[ "$PRODUCT_WORKER_IMAGE" =~ ^ghcr\.io/tommylin15/omniagent/[a-z0-9-]+@sha256:[a-f0-9]{64}$ ]] || { echo 'unapproved image reference' >&2; exit 2; }
[[ "$PRODUCT_WORKER_SERVICE" =~ ^[a-z][a-z0-9-]{0,61}[a-z0-9]$ ]] || exit 2
[[ -f "$PRODUCT_WORKER_ENV_FILE" ]] || { echo 'env file missing' >&2; exit 2; }
[[ "$PRODUCT_WORKER_NETWORK" =~ ^[a-z][a-z0-9-]{0,62}$ && "$PRODUCT_WORKER_SUBNET" =~ ^[a-z][a-z0-9-]{0,62}$ ]] || exit 2
[[ "$PRODUCT_WORKER_TAG" =~ ^[a-z][a-z0-9-]{0,40}$ ]] || exit 2
IFS=',' read -r -a product_bindings <<< "$PRODUCT_WORKER_SECRET_BINDINGS"
for binding in "${product_bindings[@]}"; do
  [[ "$binding" =~ ^([A-Z][A-Z0-9_]*|/[A-Za-z0-9_./-]+)=[A-Za-z0-9_-]+:[1-9][0-9]*$ ]] || exit 2
done
if [[ "${2:-}" != '--apply' ]]; then
  echo "plan_only kind=$kind service=$PRODUCT_WORKER_SERVICE private=true traffic=0 max_instances=1"
  exit 0
fi
# Operators must configure authenticated callers separately; never grant public invocation.
gcloud run deploy "$PRODUCT_WORKER_SERVICE" --project "$OMNIAGENT_GCP_PROJECT" \
  --region "$OMNIAGENT_GCP_REGION" --image "$PRODUCT_WORKER_IMAGE" \
  --service-account "$PRODUCT_WORKER_SERVICE_ACCOUNT" --env-vars-file "$PRODUCT_WORKER_ENV_FILE" \
  --set-secrets "$PRODUCT_WORKER_SECRET_BINDINGS" --network "$PRODUCT_WORKER_NETWORK" --subnet "$PRODUCT_WORKER_SUBNET" \
  --vpc-egress private-ranges-only --tag "$PRODUCT_WORKER_TAG" \
  --no-allow-unauthenticated --no-traffic --max-instances 1 --concurrency 1 --memory 1Gi --timeout 900 --quiet
gcloud run services describe "$PRODUCT_WORKER_SERVICE" --project "$OMNIAGENT_GCP_PROJECT" \
  --region "$OMNIAGENT_GCP_REGION" --format='json(status.latestCreatedRevisionName,status.traffic,status.conditions)'
