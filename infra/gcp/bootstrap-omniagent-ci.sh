#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${OMNIAGENT_GCP_PROJECT_ID:-gen-lang-client-0593591102}"
REGION="${OMNIAGENT_GCP_REGION:-us-central1}"
EXPECTED_PROJECT_NUMBER="131494961796"
POOL_ID="omniagent-github"
PROVIDER_ID="github"
CI_SERVICE_ACCOUNT_ID="omniagent-ci"
ARTIFACT_REPOSITORY="omniagent"
GITHUB_REPOSITORY="tommylin15/omniAgent"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ "$PROJECT_NUMBER" != "$EXPECTED_PROJECT_NUMBER" ]]; then
  echo "unexpected project number: $PROJECT_NUMBER" >&2
  exit 2
fi

gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID"

CI_SERVICE_ACCOUNT="${CI_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$CI_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$CI_SERVICE_ACCOUNT_ID" \
    --display-name="omniAgent GitHub CI" \
    --project="$PROJECT_ID"
fi

if ! gcloud iam workload-identity-pools describe "$POOL_ID" \
  --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --location=global \
    --display-name="omniAgent GitHub" \
    --project="$PROJECT_ID"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --workload-identity-pool="$POOL_ID" \
  --location=global \
  --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --workload-identity-pool="$POOL_ID" \
    --location=global \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${GITHUB_REPOSITORY}' && assertion.ref=='refs/heads/main'" \
    --project="$PROJECT_ID"
fi

WIF_MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPOSITORY}"
gcloud iam service-accounts add-iam-policy-binding "$CI_SERVICE_ACCOUNT" \
  --member="$WIF_MEMBER" \
  --role="roles/iam.workloadIdentityUser" \
  --project="$PROJECT_ID" >/dev/null

for role in roles/run.admin roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CI_SERVICE_ACCOUNT}" \
    --role="$role" \
    --condition=None >/dev/null
done

for runtime_sa in \
  "omniagent-chat@${PROJECT_ID}.iam.gserviceaccount.com" \
  "omniagent-gateway@${PROJECT_ID}.iam.gserviceaccount.com"; do
  gcloud iam service-accounts describe "$runtime_sa" --project="$PROJECT_ID" >/dev/null
  gcloud iam service-accounts add-iam-policy-binding "$runtime_sa" \
    --member="serviceAccount:${CI_SERVICE_ACCOUNT}" \
    --role="roles/iam.serviceAccountUser" \
    --project="$PROJECT_ID" >/dev/null
done

if ! gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
  --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
    --repository-format=docker \
    --location="$REGION" \
    --description="omniAgent container images" \
    --project="$PROJECT_ID"
fi

gcloud artifacts repositories add-iam-policy-binding "$ARTIFACT_REPOSITORY" \
  --location="$REGION" \
  --member="serviceAccount:${CI_SERVICE_ACCOUNT}" \
  --role="roles/artifactregistry.writer" \
  --project="$PROJECT_ID" >/dev/null

BUILD_SERVICE_ACCOUNT="$(gcloud builds get-default-service-account --project="$PROJECT_ID")"
gcloud artifacts repositories add-iam-policy-binding "$ARTIFACT_REPOSITORY" \
  --location="$REGION" \
  --member="serviceAccount:${BUILD_SERVICE_ACCOUNT}" \
  --role="roles/artifactregistry.writer" \
  --project="$PROJECT_ID" >/dev/null

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo "OMNIAGENT_GCP_WIF_PROVIDER=${WIF_PROVIDER}"
echo "OMNIAGENT_GCP_CI_SERVICE_ACCOUNT=${CI_SERVICE_ACCOUNT}"
echo "OMNIAGENT_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY}"

gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --workload-identity-pool="$POOL_ID" \
  --location=global \
  --project="$PROJECT_ID" \
  --format='value(name,state,attributeCondition)'

gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(name,format)'
