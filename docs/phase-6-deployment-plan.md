# Phase 6 — omniAgent deployment control

Status: active control document. Current state must be proven from this repository and omniAgent runtime evidence. Do not use another project's repository as a source of truth for omniAgent credentials, deployment wiring, runtime state or completion.

## Confirmed omniAgent resources / contracts

- Cloud Run service recorded at the accepted checkpoint: `omniagent-agent-gateway`; recorded revision `omniagent-agent-gateway-00001-wav`. Live revision must be re-read before any new acceptance claim.
- Runtime service accounts recorded for omniAgent: `omniagent-gateway@gen-lang-client-0593591102.iam.gserviceaccount.com` and `omniagent-chat@gen-lang-client-0593591102.iam.gserviceaccount.com`.
- Secret Manager bundle: `omniagent-provider-bundle`.
  - Gateway bundle contract expects `gemini_api_key`, `openrouter_api_key`, and `mcp_owner_signing_key`.
  - `mcp_owner_signing_key` is loaded into `MCP_OWNER_SIGNING_KEY`.
  - There is no separate `omniagent-internal-signing-key`; references to it are obsolete and must not be recreated.
- Gateway runtime reads the bundle through `OMNIAGENT_PROVIDER_BUNDLE`.
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

- Provider credentials stay in `omniagent-provider-bundle`; database credentials must not be added to that bundle.
- The current live Chat revision still references the historical `omniagent-bundle` for `CHAT_DATABASE_URL`. Do not update that Secret's `latest` value as part of candidate preparation because a restarted live instance could observe the new value before acceptance.
- The new database contract uses the dedicated omniAgent Secret `omniagent-chat-db`, whose payload is a PostgreSQL DSN for role `omniagent_chat_app` and database `omniagent_chat`.
- Dev reuses the approved PostgreSQL instance already running on the existing VM. omniAgent creates a separate logical database/role/schema inside that instance; it does not run a second PostgreSQL container.
- Candidate deployment binds `CHAT_DATABASE_URL=omniagent-chat-db:latest` only on a no-traffic candidate revision.
- Current live Chat has no VPC egress configuration. A private PostgreSQL endpoint therefore requires Direct VPC egress on the candidate revision before database readiness can pass.
- `/health` remains process liveness; `/ready` is the database-backed readiness gate and must return 200 before candidate acceptance.
- The P0 Chat candidate image is built directly on the GitHub runner and pushed to the omniAgent Artifact Registry. The previously prepared dedicated PostgreSQL image is superseded by the shared-instance decision and is not part of the active deployment path. Do not recreate or rely on the default Cloud Build source-staging bucket for this path.

## Chat deployment prerequisites

Before deploying or promoting `omniagent-chat`:

1. exact-head Node + Flutter CI PASS;
2. omniAgent GCP preflight PASS;
3. Chat database/role and migrations verified;
4. `CHAT_DATABASE_URL`, `OMNIAGENT_GOOGLE_CLIENT_ID`, `CHAT_INTERNAL_AUDIENCE`, and `CHAT_INTERNAL_ALLOWED_EMAILS` resolved from approved omniAgent configuration;
5. Gateway URL and service-to-service invocation verified;
6. immutable image digest recorded;
7. health, UI, protected API, OAuth and two-owner isolation acceptance executed;
8. provider, approval, cancel, reconnect and event replay behavior verified through the real Chat path.

## External domain integrations

External systems are integration targets only. They may be consumed through approved bounded authenticated Tool/MCP/Data Source contracts. Their repositories, credentials, storage and deployment state are not omniAgent current-state sources and must not be read to fill missing omniAgent values.

## Completion rule

Implementation, tests, CI, deployment and runtime/integration evidence are all required. A built image, a successful source CI run, or a historical checkpoint alone is not `DONE`.
