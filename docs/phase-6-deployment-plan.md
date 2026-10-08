# Phase 6 — omniAgent deployment control

> **CI/CD precedence as of 2026-10-08:** Historical Cloud Build or Artifact Registry image publication instructions below are superseded for **new releases** by [GitHub Actions + public GHCR + Cloud Run runbook](cicd-ghcr-actions-runbook.md) and [SPEC §8](../doc/spec.md#8-cicd--github-actions--public-ghcr--cloud-run-2026-10-08). Keep the existing runtime networking, identities, Secret and OAuth requirements. This documentation update is not deployment evidence.

Status: active control document. Current state must be proven from this repository and omniAgent runtime evidence. Do not use another project's repository as a source of truth for omniAgent credentials, deployment wiring, runtime state or completion.

## Confirmed omniAgent resources / contracts

- Cloud Run service recorded at the accepted checkpoint: `omniagent-agent-gateway`; recorded revision `omniagent-agent-gateway-00001-wav`. Live revision must be re-read before any new acceptance claim.
- Runtime service accounts recorded for omniAgent: `omniagent-gateway@gen-lang-client-0593591102.iam.gserviceaccount.com` and `omniagent-chat@gen-lang-client-0593591102.iam.gserviceaccount.com`.
- Owner-updated Secret Manager contract (2026-10-08): use **existing**
  `omniagent-bundle` for Gemini, OpenRouter, owner signing key and Chat DB DSN.
  Do **not** create `omniagent-provider-bundle` or another signing Secret.
- Required JSON keys: `gemini_api_key`, `openrouter_api_key`,
  `mcp_owner_signing_key`, `chat_database_url`.
  Gateway environment `OMNIAGENT_PROVIDER_BUNDLE` and Chat environment
  `OMNIAGENT_BUNDLE` both reference `omniagent-bundle:latest`, with different
  application-side field extraction. The old `CHAT_DATABASE_URL` binding
  must be removed **from the no-traffic candidate only**.
- Single-Secret IAM removes field-level isolation: both Chat and Gateway
  runtime service accounts must be treated as having access to all four values.
  `mcp_owner_signing_key` is loaded into `MCP_OWNER_SIGNING_KEY`.
  No separate internal signing Secret is allowed.
- Internal HMAC headers are `X-OmniAgent-Timestamp` and `X-OmniAgent-Signature`.
- Dedicated Google Web OAuth client for omniAgent is recorded as `omniAgent Dev Web`.
- Chat/UI image was previously built as `omniagent-chat`; current live deployment state must be verified before claiming it is deployed.

## Deployment identity

GitHub Actions must use an omniAgent-owned WIF/CI identity. Never use another project's CI service account as a shortcut.

Tracked non-secret deployment identifiers:

- `OMNIAGENT_GCP_WIF_PROVIDER=projects/131494961796/locations/global/workloadIdentityPools/omniagent-github/providers/github`
- `OMNIAGENT_GCP_CI_SERVICE_ACCOUNT=omniagent-ci@gen-lang-client-0593591102.iam.gserviceaccount.com`
- `OMNIAGENT_ARTIFACT_REPOSITORY=omniagent`

These identifiers are fixed in the preflight workflow so GitHub repository-variable drift cannot silently change the deployment target. GCP resource creation and IAM binding are idempotently defined in `infra/gcp/bootstrap-omniagent-ci.sh`. The provider is restricted to `tommylin15/omniAgent` on `refs/heads/main`. Runtime evidence is still required before these resources may be called configured or PASS.

## Cloud Build / Artifact Registry

`cloudbuild.yaml` requires an explicit `_IMAGE_REPOSITORY`; no legacy repository name is hard-coded. Build/deploy automation must pass the approved omniAgent Artifact Registry repository.

## Chat database secret and candidate networking

- The current active Chat revision was read back as referencing
  `CHAT_DATABASE_URL=omniagent-bundle:2`. Version 2 is a pinned historical
  Secret version and must be retained and never overwritten/destroyed.
- The dedicated `omniagent-chat-db` currently contains the verified
  PostgreSQL URL for `omniagent_chat_app` / `omniagent_chat`.
  It is a **migration source and rollback reference**, not the future
  candidate runtime dependency. Do not destroy it before accepted cutover.
- The administrator-only migration script copies that URL and the approved
  existing provider keys into a newly created **version of `omniagent-bundle`**,
  generating only the missing owner signing key. No new Secret resource.
- Dev reuses the approved shared PostgreSQL instance; no additional DB server.
- The Chat no-traffic candidate binds `OMNIAGENT_BUNDLE=omniagent-bundle:latest`,
  removes legacy `CHAT_DATABASE_URL`, checks the private VPC egress and uses
  dev private self-signed TLS. Chat `/ready=200` must be proven live.
- All active traffic remains untouched unless mandatory canonical gates pass.
- `/health` remains process liveness; `/ready` is the database-backed readiness gate and must return 200 before candidate acceptance.
- The P0 Chat candidate image is built directly on the GitHub runner and pushed to the omniAgent Artifact Registry. The previously prepared dedicated PostgreSQL image is superseded by the shared-instance decision and is not part of the active deployment path. Do not recreate or rely on the default Cloud Build source-staging bucket for this path.

## Chat deployment prerequisites

Before deploying or promoting `omniagent-chat`:

1. exact-head Node + Flutter CI PASS;
2. omniAgent GCP preflight PASS;
3. Chat database/role and migrations verified;
4. `chat_database_url` loaded from verified `OMNIAGENT_BUNDLE`;
   `OMNIAGENT_GOOGLE_CLIENT_ID`, `CHAT_INTERNAL_AUDIENCE`, and
   `CHAT_INTERNAL_ALLOWED_EMAILS` preserved from approved omniAgent configuration;
5. Gateway URL and service-to-service invocation verified;
6. immutable image digest recorded;
7. health, UI, protected API, OAuth and two-owner isolation acceptance executed;
8. provider, approval, cancel, reconnect and event replay behavior verified through the real Chat path.

## External domain integrations

External systems are integration targets only. They may be consumed through approved bounded authenticated Tool/MCP/Data Source contracts. Their repositories, credentials, storage and deployment state are not omniAgent current-state sources and must not be read to fill missing omniAgent values.

## Completion rule

Implementation, tests, CI, deployment and runtime/integration evidence are all required. A built image, a successful source CI run, or a historical checkpoint alone is not `DONE`.
