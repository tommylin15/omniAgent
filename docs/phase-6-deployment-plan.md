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

Required repository variables:

- `OMNIAGENT_GCP_WIF_PROVIDER`
- `OMNIAGENT_GCP_CI_SERVICE_ACCOUNT`
- `OMNIAGENT_ARTIFACT_REPOSITORY`

Exact live values are intentionally not fabricated. The preflight workflow fails closed when any value is missing.

## Cloud Build / Artifact Registry

`cloudbuild.yaml` requires an explicit `_IMAGE_REPOSITORY`; no legacy repository name is hard-coded. Build/deploy automation must pass the approved omniAgent Artifact Registry repository.

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

External systems, including Janus, are integration targets only. They may be consumed through approved bounded authenticated API/MCP contracts. Their repositories, credentials, storage and deployment state are not omniAgent current-state sources and must not be read to fill missing omniAgent values.

## Completion rule

Implementation, tests, CI, deployment and runtime/integration evidence are all required. A built image, a successful source CI run, or a historical checkpoint alone is not `DONE`.
