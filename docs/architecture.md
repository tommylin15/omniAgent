# Architecture — current target and implementation boundary

> Architecture revision: 2026-10-07.
> Implementation baseline reviewed before this documentation-only revision: `main@75336a248381d935c7b23dd8afab06f5e9c4151a`.
> This document distinguishes **target architecture** from **implemented/live evidence**.

## 1. Architecture decision

omniAgent will use a split **runtime state plane**, **credential plane**, and **historical data plane**.

```text
Flutter Web
   |
   v
Chat API
   |
   +-------------------- PostgreSQL / omni_chat
   |                      authoritative hot state
   |                      owner/thread/turn/event/approval/skill
   |                      idempotency/dispatch/cursor
   |
   +--> durable dispatcher/worker
             |
             v
        Agent Gateway
             |
             +--> Gemini
             +--> OpenRouter
             +--> Groq          [target; not implemented]
             +--> Codex
             +--> MCP / external domain tools
             |
             v
        runtime events/results
             |
             +--> Chat API --> PostgreSQL --> SSE/cursor --> Flutter

Asynchronous data lifecycle:
PostgreSQL events / artifacts
   +--> GCS large-object/artifact storage
   +--> Iceberg historical event/audit/analytics tables
             |
             +--> BigLake/BigQuery analytics/query target
```

Iceberg is **not** the live Chat queue or turn state machine. A queued/running/approval/retry/cancel/completed transition requires transactional ownership, idempotency, ordering, and recovery semantics; PostgreSQL remains authoritative for those operations.

## 2. Runtime state plane

`services/chat-api` and `omni_chat` own the target operational Chat state:

- immutable owner identity keyed by authenticated issuer + subject;
- threads, turns, event sequence/cursors, approvals, Skills and idempotency records;
- future dispatcher claim/lease/attempt state;
- owner-scoped recent conversation state and summaries needed for normal model context;
- archive/artifact references when payloads are externalized.

Large payloads do not need to remain inline forever. A future size/lifecycle policy may put large message bodies, attachments, tool output, exports, and worker artifacts in GCS while PostgreSQL retains owner/thread/turn metadata, digest, size, media type, and an authorized object reference.

No concrete size threshold or retention duration is approved by this design; those values require measurement and an explicit data-lifecycle decision.

## 3. Historical data plane

The target historical layer is GCS + Apache Iceberg, with BigLake/BigQuery integration for analytics where approved.

Candidate Iceberg tables include:

- `conversation_events`;
- `worker_executions`;
- `tool_executions`;
- `provider_usage`;
- `approval_audit`;
- `task_history` / `workflow_history`.

Archive records MUST retain `owner_id` and source IDs needed for deterministic reconstruction and audit, but the physical partition strategy SHOULD avoid one partition per owner. The default design preference is a time transform such as `days(event_time)` plus a bucket/hash transform on `owner_id`, subject to measured file sizes and query patterns.

The archive pipeline is asynchronous and idempotent. It must not acknowledge or complete a live turn merely because an Iceberg write succeeded, and an Iceberg failure must not silently corrupt PostgreSQL turn state.

PostgreSQL remains the authoritative source for current runtime state. Iceberg becomes authoritative only for the historical archive records that have passed archive/reconciliation acceptance according to the future lifecycle policy.

## 4. Credential plane: BYOK + platform credentials

Provider payment/authentication identity is independent from Chat memory identity.

Every dispatch MUST resolve both:

1. **owner context** — which authenticated `owner_id` owns the thread, memory, tools, approvals, artifacts, and execution state;
2. **credential source** — which authorized credential profile may be used to call the selected provider.

Target credential modes:

- `OWNER_BYOK`: the owner supplies their own provider credential/auth material.
- `PLATFORM`: an entitled owner may use an omniAgent-managed platform credential.
- Future credential pools MAY distinguish research/admin/default pools without changing memory ownership.

A future Credential Resolver should accept owner, provider/runtime, requested credential mode/profile, and entitlement context, then return an internal credential reference. It MUST NOT return raw secrets to Flutter.

PostgreSQL may store credential metadata/reference such as owner, provider, mode, status, masked label, secret reference, and validation timestamps. Raw API keys, refresh tokens, Codex auth bundles, or equivalent secrets MUST NOT be stored in Chat/event/Skill/Iceberg payloads. Secret material belongs in an approved secret store such as Secret Manager and must be injected only into the bounded execution that requires it.

Platform-key entitlement is explicit. Being authenticated or having an ordinary Chat account MUST NOT imply permission to spend a platform credential.

Audit events may record provider, model, credential source class, and non-secret credential/profile identifier for experiment reproducibility; they must never record the secret itself.

## 5. Owner-isolated memory invariant

Credential sharing does not imply memory sharing.

Even when Owner A and Owner B use the same platform Gemini/OpenRouter/Groq/Codex credential, all of the following remain owner-scoped:

- threads and turns;
- event replay and summaries;
- Skills and tool state;
- MCP sessions;
- retrieval/memory results;
- approvals;
- GCS artifact references;
- Iceberg historical rows;
- task/workflow state;
- provider/session/thread mappings.

The isolation key is `owner_id`, not API-key ID, billing account, provider account, or model name.

## 6. Codex execution isolation

Codex requires stricter treatment than a stateless HTTP API-key provider because local auth/session/thread/workspace state may exist.

For each owner execution, the runtime MUST isolate the equivalent of:

- Codex auth/session directory (for example an owner-scoped `CODEX_HOME` or stronger sandbox boundary);
- Codex thread/session mapping;
- workspace/working directory;
- tool/MCP session state;
- environment variables;
- process lifetime and cancellation;
- persisted execution metadata.

A platform Codex credential may be reused only as provider authorization. It MUST NOT cause owners to share a writable home directory, thread/session cache, workspace, or conversation context.

Current source contains the Codex bridge and managed auth concepts, but generalized BYOK/platform credential resolution and the above multi-owner execution acceptance remain open.

## 7. Agent Gateway and provider status

`services/agent-gateway` currently contains the copied Codex bridge, Gemini/OpenRouter adapters, MCP Host, and internal runtime.

Target provider contract:

- Gemini — current source; previous real provider dev probe passed.
- OpenRouter — current source; previous real provider dev probe passed.
- Codex — current source; owner-auth/live acceptance remains open.
- Groq — approved target for experimentation; direct adapter/dispatch is currently absent.

All providers must emit the generic Agent event contract and must not expose provider credentials to Chat content or the UI.

## 8. Durable dispatch and event delivery

The current Chat API can persist queued turns and stored events, but the durable Chat→Gateway execution path is still open.

The target dispatcher must:

- transactionally claim queued work;
- preserve `owner_id`, thread, runtime/model, credential policy, and idempotency;
- call the private Gateway with authenticated service identity;
- append runtime events through an authenticated internal Chat contract;
- handle retry, crash, cancel, and terminal transitions without duplicate externally visible effects.

The event transport must be based on persisted event state and cursor replay. Streaming is a delivery optimization, not the source of truth. Browser reconnect must resume from persisted sequence/cursor state.

A delivery mechanism such as Cloud Tasks may be evaluated as a wake-up mechanism later, but it is not approved or implemented by this document and must not become the source of truth for queue state.

## 9. Janus boundary

Janus remains a separate domain system. omniAgent MAY consume approved Janus data/tools only through bounded authenticated API/MCP.

omniAgent MUST NOT:

- import Janus internals as runtime dependencies;
- read Janus PostgreSQL directly;
- read Janus GCS/Iceberg directly;
- treat Janus storage as omniAgent memory storage.

Janus can therefore be one external domain/tool provider without owning omniAgent's Chat memory, credential plane, or data lakehouse.

## 10. Current implementation truth

The design above is not a completion claim.

At the reviewed GitHub baseline:

- PostgreSQL `omni_chat` source/migrations exist but live application/cutover evidence remains open.
- durable Chat→Gateway dispatcher is absent as an integrated accepted path;
- finite SSE/cursor replay exists, with two-second UI polling at the recorded source checkpoint;
- Gemini/OpenRouter real Gateway probes previously passed;
- Codex live owner-auth acceptance remains open;
- Groq direct provider support is absent;
- generalized BYOK/platform Credential Resolver is absent;
- omniAgent GCS artifact tier / Iceberg historical lakehouse / BigLake analytics path is a target design, not implemented evidence.

Any infrastructure, secret, BigLake/BigQuery, bucket, scheduler, or paid resource required by this architecture needs separate implementation and cost approval.
