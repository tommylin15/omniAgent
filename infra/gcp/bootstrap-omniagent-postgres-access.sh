#!/usr/bin/env bash
set -euo pipefail

action="${1:-grant}"
PROJECT_ID="${OMNIAGENT_GCP_PROJECT_ID:-gen-lang-client-0593591102}"
REGION="${OMNIAGENT_GCP_REGION:-us-central1}"
CI_SERVICE_ACCOUNT="${OMNIAGENT_GCP_CI_SERVICE_ACCOUNT:-omniagent-ci@${PROJECT_ID}.iam.gserviceaccount.com}"
CHAT_RUNTIME_SERVICE_ACCOUNT="${OMNIAGENT_CHAT_SERVICE_ACCOUNT:-omniagent-chat@${PROJECT_ID}.iam.gserviceaccount.com}"
DB_SECRET="${OMNIAGENT_CHAT_DB_SECRET:-omniagent-chat-db}"
LEGACY_FIREWALL_RULE="${OMNIAGENT_POSTGRES_LEGACY_FIREWALL_RULE:-omniagent-postgres-dev}"

: "${OMNIAGENT_POSTGRES_HOST_VM:?OMNIAGENT_POSTGRES_HOST_VM is required}"
: "${OMNIAGENT_POSTGRES_HOST_ZONE:?OMNIAGENT_POSTGRES_HOST_ZONE is required}"

ci_member="serviceAccount:${CI_SERVICE_ACCOUNT}"
runtime_member="serviceAccount:${CHAT_RUNTIME_SERVICE_ACCOUNT}"

gcloud config set project "$PROJECT_ID" >/dev/null

instance_json="$(mktemp)"
trap 'rm -f "$instance_json"' EXIT
gcloud compute instances describe "$OMNIAGENT_POSTGRES_HOST_VM"   --zone="$OMNIAGENT_POSTGRES_HOST_ZONE"   --project="$PROJECT_ID"   --format=json >"$instance_json"

read -r vm_sa network subnet < <(python3 - "$instance_json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
sa=(d.get("serviceAccounts") or [{}])[0].get("email","")
ni=(d.get("networkInterfaces") or [{}])[0]
network=ni.get("network","").rsplit("/",1)[-1]
subnet=ni.get("subnetwork","").rsplit("/",1)[-1]
if not sa or not network or not subnet:
    raise SystemExit("PostgreSQL host IAM/network metadata is incomplete")
print(sa,network,subnet)
PY
)
if [[ "$action" == "grant" ]]; then
  if ! gcloud secrets describe "$DB_SECRET" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$DB_SECRET"       --replication-policy=user-managed       --locations="$REGION"       --project="$PROJECT_ID"
  fi

  gcloud secrets add-iam-policy-binding "$DB_SECRET"     --project="$PROJECT_ID"     --member="$runtime_member"     --role=roles/secretmanager.secretAccessor >/dev/null

  for role in roles/secretmanager.secretAccessor roles/secretmanager.secretVersionAdder; do
    gcloud secrets add-iam-policy-binding "$DB_SECRET"       --project="$PROJECT_ID"       --member="$ci_member"       --role="$role" >/dev/null
  done

  for role in roles/compute.viewer roles/compute.osAdminLogin roles/iap.tunnelResourceAccessor; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID"       --member="$ci_member"       --role="$role"       --condition=None >/dev/null
  done

  gcloud iam service-accounts add-iam-policy-binding "$vm_sa"     --project="$PROJECT_ID"     --member="$ci_member"     --role=roles/iam.serviceAccountUser >/dev/null


  echo "omniAgent PostgreSQL bootstrap access granted."
  echo "db_secret=$DB_SECRET"
  echo "postgres_network=$network"
  echo "postgres_subnet=$subnet"
elif [[ "$action" == "revoke" ]]; then
  for role in roles/secretmanager.secretAccessor roles/secretmanager.secretVersionAdder; do
    gcloud secrets remove-iam-policy-binding "$DB_SECRET"       --project="$PROJECT_ID"       --member="$ci_member"       --role="$role" >/dev/null || true
  done

  for role in roles/compute.viewer roles/compute.osAdminLogin roles/iap.tunnelResourceAccessor; do
    gcloud projects remove-iam-policy-binding "$PROJECT_ID"       --member="$ci_member"       --role="$role"       --condition=None >/dev/null || true
  done

  gcloud iam service-accounts remove-iam-policy-binding "$vm_sa"     --project="$PROJECT_ID"     --member="$ci_member"     --role=roles/iam.serviceAccountUser >/dev/null || true

  echo "omniAgent PostgreSQL temporary bootstrap access revoked."
  if gcloud compute firewall-rules describe "$LEGACY_FIREWALL_RULE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud compute firewall-rules delete "$LEGACY_FIREWALL_RULE" --project="$PROJECT_ID" --quiet >/dev/null || true
  fi

  echo "Persistent runtime access retained only for the DB Secret runtime reader; shared-host network policy remains external to omniAgent bootstrap."
else
  echo "usage: $0 grant|revoke" >&2
  exit 2
fi
