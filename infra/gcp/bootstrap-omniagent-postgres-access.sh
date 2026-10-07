#!/usr/bin/env bash
set -euo pipefail

action="${1:-grant}"
PROJECT_ID="${OMNIAGENT_GCP_PROJECT_ID:-gen-lang-client-0593591102}"
CI_SERVICE_ACCOUNT="${OMNIAGENT_GCP_CI_SERVICE_ACCOUNT:-omniagent-ci@${PROJECT_ID}.iam.gserviceaccount.com}"
CHAT_RUNTIME_SERVICE_ACCOUNT="${OMNIAGENT_CHAT_SERVICE_ACCOUNT:-omniagent-chat@${PROJECT_ID}.iam.gserviceaccount.com}"
DB_SECRET="${OMNIAGENT_CHAT_DB_SECRET:-omniagent-chat-db}"
: "${OMNIAGENT_POSTGRES_HOST_VM:?OMNIAGENT_POSTGRES_HOST_VM is required}"
: "${OMNIAGENT_POSTGRES_HOST_ZONE:?OMNIAGENT_POSTGRES_HOST_ZONE is required}"

ci_member="serviceAccount:${CI_SERVICE_ACCOUNT}"
runtime_member="serviceAccount:${CHAT_RUNTIME_SERVICE_ACCOUNT}"

gcloud config set project "$PROJECT_ID" >/dev/null

if [[ "$action" == "grant" ]]; then
  if ! gcloud secrets describe "$DB_SECRET" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$DB_SECRET" --replication-policy=automatic --project="$PROJECT_ID"
  fi
  for role in roles/secretmanager.secretAccessor roles/secretmanager.secretVersionAdder; do
    gcloud secrets add-iam-policy-binding "$DB_SECRET" --project="$PROJECT_ID" \
      --member="$ci_member" --role="$role" >/dev/null
  done
  gcloud secrets add-iam-policy-binding "$DB_SECRET" --project="$PROJECT_ID" \
    --member="$runtime_member" --role=roles/secretmanager.secretAccessor >/dev/null

  for role in roles/compute.viewer roles/compute.osAdminLogin roles/iap.tunnelResourceAccessor; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="$ci_member" --role="$role" --condition=None >/dev/null
  done

  vm_sa="$(gcloud compute instances describe "$OMNIAGENT_POSTGRES_HOST_VM" \
    --zone="$OMNIAGENT_POSTGRES_HOST_ZONE" --project="$PROJECT_ID" \
    --format='value(serviceAccounts[0].email)')"
  if [[ -n "$vm_sa" ]]; then
    gcloud iam service-accounts add-iam-policy-binding "$vm_sa" --project="$PROJECT_ID" \
      --member="$ci_member" --role=roles/iam.serviceAccountUser >/dev/null
  fi
  echo "omniAgent PostgreSQL bootstrap access granted."
elif [[ "$action" == "revoke" ]]; then
  for role in roles/secretmanager.secretAccessor roles/secretmanager.secretVersionAdder; do
    gcloud secrets remove-iam-policy-binding "$DB_SECRET" --project="$PROJECT_ID" \
      --member="$ci_member" --role="$role" >/dev/null || true
  done
  for role in roles/compute.viewer roles/compute.osAdminLogin roles/iap.tunnelResourceAccessor; do
    gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
      --member="$ci_member" --role="$role" --condition=None >/dev/null || true
  done
  vm_sa="$(gcloud compute instances describe "$OMNIAGENT_POSTGRES_HOST_VM" \
    --zone="$OMNIAGENT_POSTGRES_HOST_ZONE" --project="$PROJECT_ID" \
    --format='value(serviceAccounts[0].email)' 2>/dev/null || true)"
  if [[ -n "$vm_sa" ]]; then
    gcloud iam service-accounts remove-iam-policy-binding "$vm_sa" --project="$PROJECT_ID" \
      --member="$ci_member" --role=roles/iam.serviceAccountUser >/dev/null || true
  fi
  echo "omniAgent PostgreSQL bootstrap access revoked; runtime secret access retained."
else
  echo "usage: $0 grant|revoke" >&2
  exit 2
fi
