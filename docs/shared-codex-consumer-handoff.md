# Shared Codex — Consumer Integration Handoff

Updated: 2026-10-08. Owner: omniAgent. Scope: delivery contract for downstream application teams. **This document does not modify consumer repositories and does not assert consumer rollout.**

## Shared service

- Base URL / Google Cloud Run ID token audience: `https://omniagent-shared-codex-2oo7qbkd5q-uc.a.run.app`.
- HTTP route: `POST /v1/codex/execute`.
- GCP project / region: `gen-lang-client-0593591102` / `us-central1`.
- Cloud Run service: `omniagent-shared-codex`; **private**, no public invoker.
- Credential source is the dedicated `omniagent-shared-codex-auth` Secret accessed by the shared runtime only. **Consumers must never copy or read Codex refresh tokens.**
- User-scoped memory remains owned by each consumer; request-scoped workspace, Codex home and thread are created and removed on every request.
- Request must be bounded, text-only; no shell, web, git writes, MCP, or cross-project database access.

## Caller mapping (strict)

| Request `project` | Dedicated caller Google service account |
|---|---|
| `life-assistant` | `omniagent-codex-life-client@gen-lang-client-0593591102.iam.gserviceaccount.com` |
| `market-mart` | `omniagent-codex-market-client@gen-lang-client-0593591102.iam.gserviceaccount.com` |
| `omniagent` | `omniagent-codex-chat-client@gen-lang-client-0593591102.iam.gserviceaccount.com` |

Callers must both (1) obtain an **audience-bound Google ID token** minted as the matching SA with verified SA email and (2) possess `roles/run.invoker` on this **specific Cloud Run service**. For an existing runtime using another service identity, the owner must configure restricted ID-token impersonation on its dedicated caller account or switch its runtime identity only after verifying its other IAM dependencies. The release CI service account's test-only TokenCreator grants must not be repurposed by consumer applications.

## Request and response contract

```json
{
  "project": "life-assistant",
  "ownerId": "00000000-0000-4000-8000-000000000001",
  "requestId": "00000000-0000-4000-8000-000000000002",
  "prompt": "Respond only with a brief summary of the facts provided here."
}
```

`project` must match the verified token identity. Both IDs must be valid UUIDs. Use one stable logical owner UUID per user in each consumer and a unique request UUID for each execution. The caller must explicitly supply context that the model needs; no consumer memory is fetched by the shared Cloud Run. Optional `model` can be specified only after proving the account's entitlement for that exact Codex model; unspecified model uses the installed Codex App Server default.

Successful response:

```json
{
  "status": "completed",
  "project": "life-assistant",
  "ownerId": "00000000-0000-4000-8000-000000000001",
  "requestId": "00000000-0000-4000-8000-000000000002",
  "result": {"text": "A real model-generated response."},
  "providerIds": {"threadId": "native-codex-thread-id", "turnId": "native-codex-turn-id"}
}
```

Response is synchronous; maximum prompt is 16 KiB UTF-8, output at most 32,000 characters and model turn budget 120 s. An individual caller should set its HTTP timeout to at least 160 s, keep a concurrency queue, and treat `429` as overloaded (max one instance, concurrency one). `400` indicates malformed input, `401` unauthenticated ID token, `403` project/SA mismatch or Cloud Run IAM denial, and `502` upstream Codex/credential/transport failure. This version has no durable idempotency, exactly-once execution, or long-running workflow API; **do not blindly retry non-idempotent prompts**.

Consumers must not send tokens, system secrets, entire private histories or database content unless specifically authorized. Log request ID and status, not raw prompts or token strings. Avoid populating tenant memory from other users.

## Acceptance and owner boundary

The standalone private service passed GitHub Actions [37709954944 attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/37709954944): deployed Cloud Run, dedicated auth, all three signed real model calls, two cross-project denials and anonymous rejection. Each consumer must independently demonstrate its runtime's identity token, correct request label, HTTP 200, response parsing, error handling, tenant isolation and functional UX before its own work is CLOSED. Shared-service integration is not the same as consumer-side completion.

Independent post-retirement checks run in `.github/workflows/shared-codex-post-retirement.yml`. Credential Secret deletion is a **separate** administrative operation, not verifiable by the everyday CI SA; do not conflate Cloud Run post-retirement health with independent proof that the old Secret no longer exists.
