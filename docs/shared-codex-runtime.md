# Shared Codex runtime — integration and acceptance

Status (2026-10-08): SOURCE / NODE TEST VERIFIED. Cloud Run deployment and live authenticated provider execution are separate gates; do not mark DONE until both pass.

## Boundary

This is an omniAgent-owned **dedicated Cloud Run service**, not an extension of the existing Chat or Agent Gateway endpoints. It reuses the existing Codex App Server client, bridge, and Secret Manager credential handling, while exposing only a narrow, text-only request/response contract to approved application services.

```text
Consumer service A ── Google ID token ──┐
                                      ├─> omniagent-shared-codex (Cloud Run IAM)
Consumer service B ── Google ID token ──┘          │
                                               signed caller / project match
                                                   │
                                            fresh isolated CODEX_HOME
                                            fresh workspace, thread, process
                                                   │
                                            Codex App Server / read-only
                                                   │
                                        bounded JSON text response
```

User context is supplied by the calling service as a stable `ownerId`; no input ownerId grants access to existing omniAgent Chat threads. The Cloud Run service **does not** access consumer projects' databases or object stores, and does not load or reproduce their user memory. A platform credential can be shared as authorization only, not as a shared session or memory store.

## Endpoint

`POST /v1/codex/execute`

Request body (JSON, no extra properties):

```json
{
  "project": "consumer-a",
  "ownerId": "00000000-0000-4000-8000-000000000001",
  "requestId": "00000000-0000-4000-8000-000000000002",
  "prompt": "Summarize these explicitly provided facts.",
  "model": "optional-approved-model"
}
```

Only `model` is optional. The input is limited to 16 KiB UTF-8; output is limited to 32,000 characters. A fresh Codex App Server thread is created for each request, with a 120-second turn bound. In this initial phase, arbitrary shell commands, writable workspaces, MCP grants, repository operations, and hidden carry-over context are not exposed.

Success:

```json
{
  "status": "completed",
  "project": "consumer-a",
  "ownerId": "00000000-0000-4000-8000-000000000001",
  "requestId": "00000000-0000-4000-8000-000000000002",
  "result": { "text": "Model response." },
  "providerIds": { "threadId": "provider-thread", "turnId": "provider-turn" }
}
```

Failure statuses: 400 malformed request, 401 absent/invalid signed identity, 403 project/caller mismatch, 429 worker busy, 502 model/credential/transport failure. Cloud Run's own ingress IAM may return 403 before application code runs. The service does not return Secret values or raw internal exception messages.

Call using a signed Google ID token with `aud` equal to the service URL. The caller's service account must have `roles/run.invoker`, and the verified token email must match its configured `project` label. An ordinary API key or self-asserted project name is **not** sufficient.

## Required release configuration

Non-secret repository variables in the omniAgent repository:

- `SHARED_CODEX_AUTH_RESOURCE` — a **dedicated** Secret Manager resource, e.g. `projects/<project-id>/secrets/<dedicated-codex-auth>`. It must contain approved Codex-managed account auth as expected by the existing `ManagedAuthStore`; never paste tokens in workflow inputs or source.
- `SHARED_CODEX_CALLERS_JSON` — JSON map of project labels to exact approved caller service-account email addresses, e.g. `{"consumer-a":"consumer-a@<project-id>.iam.gserviceaccount.com","consumer-b":"consumer-b@<project-id>.iam.gserviceaccount.com"}`. The labels here are placeholders; actual identities require runtime confirmation.

The deploy workflow `.github/workflows/shared-codex-cloud-run.yml` uses omniAgent-owned GitHub WIF and Artifact Registry. It creates or uses `omniagent-shared-codex@...`, grants scoped Secret permissions for access/rotation, builds an immutable image, deploys `omniagent-shared-codex` in `us-central1` with `--no-allow-unauthenticated`, maximum one instance and concurrency one, and binds only the configured caller identities to `roles/run.invoker`.

The existing external-runtime auth Secret must not be renamed, deleted, silently re-pointed, or exposed. Migration to a dedicated Secret is a separate controlled copy/verification/cutover. Until the new Secret and caller identities exist, deployment must **fail closed**.

## Acceptance gate

1. Source build and tests for strict input, forged caller rejection, project mismatch, isolated invocation, and redacted errors.
2. GitHub workflow passes real GCP WIF authentication and preflight for the approved Secret and caller identities.
3. Dedicated runtime identity, image digest, private Cloud Run deployment, and exact IAM policy read back.
4. Anonymous call rejected; legitimate caller A and caller B can each call and receive a non-empty real Codex response; a caller cannot assert the other's project label.
5. Fresh owner/process/thread isolation, no shared memory, bounded timeouts, Secret refresh persistence, and no token/raw prompt in runtime logs.
6. Existing omniAgent Chat Gateway, external applications, and their active deploys remain unaffected.

A deployment-only PASS is not a real provider-inference PASS. Two external consumer projects must not be declared integrated until their live authenticated calls and response handling are tested individually.

## Operational cautions

This initial synchronous endpoint is intended for bounded text tasks. Long-running code changes, GitHub write operations, interactive approvals, durable retry, async queues, idempotent replay, and model/provider usage accounting are **not implemented** by this slice. Repeated requests with the same requestId do not yet implement exactly-once semantics; consumer callers must avoid automatic unsafe retries. Scopes and entitlements must be reviewed before enabling more capable modes.
