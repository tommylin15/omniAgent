# omniAgent SPEC

> Baseline: `main@4a5f74ca60c0859a8727568290b388101cbae6c1`.
> Status language in this document distinguishes source implementation from live acceptance.

## 1. Product objective

omniAgent is the independent generic Agent/Chat runtime extracted from Janus. It owns generic conversational runtime, Chat storage/API, provider dispatch, tool/MCP orchestration, Skills, approvals, and the generic Flutter Chat surface. Janus retains investment-domain ownership, canonical market/research context, bounded domain API/MCP, investment User/Admin UI, and the currently live legacy Chat path until cutover gates are passed.

The project must preserve these principles:

- no direct omniAgent reads of Janus PostgreSQL, GCS, Iceberg, or Janus internal source packages;
- no Janus runtime dependency on omniAgent;
- owner isolation must be explicit and testable;
- credentials and provider auth material must never be persisted as Chat/event content;
- partial deployment or partial tests must not be reported as full acceptance;
- live write ownership and cleanup require independent rollback evidence.

## 2. System boundary

### 2.1 omniAgent-owned components

| Component | Current path | Responsibility |
| --- | --- | --- |
| Agent Gateway | `services/agent-gateway/` | Codex bridge, Gemini/OpenRouter provider dispatch, MCP Host, approval/cancel lifecycle, managed Codex auth, internal runtime endpoints. |
| Chat API | `services/chat-api/` | Google identity verification, owner mapping, threads, turns, events, approvals, cancellation, future durable Chat write ownership. |
| Chat storage | `infra/postgres/migrations/` + `services/chat-api/storage.ts` | `omni_chat` schema, owner/thread/turn/event/approval/Skill records and idempotent writes. |
| Flutter UI | `apps/agent_app/` | Google sign-in, thread list/create/fork, message queue, event replay, approval/cancel UI, provider/model selection. |
| Contracts | `packages/contracts/agent.v1.json` | Generic Agent event/runtime/approval boundary. |
| Build/test | `package.json`, `tests/`, Flutter tests, Cloud Build configs | Repeatable build and acceptance support. |

### 2.2 Janus-owned responsibilities

Janus continues to own:

- investment authorization and domain policy;
- PIT/as-of, provenance, sanitization, canonical investment facts and domain context;
- bounded Janus API/MCP and ChatGPT→Janus MCP path;
- investment User/Admin UI;
- live legacy Chat writer/API/UI until an approved omniAgent cutover;
- existing historical Janus conversation/private data and migration history until verified copy/cutover.

## 3. Functional requirements

### FR-001 Identity and owner isolation

- User requests MUST be authenticated with a Google ID token for the configured omniAgent client audience.
- Persistent owner identity MUST be keyed by Google issuer + subject, not email.
- Internal Chat write/event calls MUST require a separate service audience and allowlisted service identity.
- Every thread, turn, event, approval, Skill, Codex auth bundle, MCP session, and Janus context request MUST remain owner-bound.

**Current status:** `DONE-CODE` for Chat API verification/owner mapping; full browser OAuth + multi-owner live acceptance remains `OPEN`.

### FR-002 Thread lifecycle

The Chat API MUST support:

- create/list/read threads;
- fixed runtime + model per thread;
- fork while preserving parent runtime/model;
- idempotent create operations;
- owner-isolated access.

**Current status:** `DONE-CODE`; live deployed acceptance remains `OPEN`.

### FR-003 Message and turn lifecycle

The Chat API MUST:

- accept a non-empty bounded user message;
- create a queued turn and user event atomically;
- expose queued/running/terminal states;
- allow cancellation before execution and runtime-aware cancellation after dispatch is wired;
- preserve idempotency and event ordering.

**Current status:** `PARTIAL`. Queue persistence and queued cancellation exist; no source path currently turns the queued Chat API record into a Gateway dispatch automatically.

### FR-004 Event transport and replay

- Events MUST be monotonic per owner/thread and replayable from a cursor.
- The public UI MUST support reconnect without duplicated events.
- The accepted live design SHOULD provide continuous or bounded long-lived event delivery rather than relying only on periodic full HTTP reconnects.

**Current status:** `PARTIAL`. Server emits SSE-formatted finite snapshots; Flutter currently fetches/parses the response and polls every two seconds. Continuous streaming/reconnect has not been live accepted.

### FR-005 Provider dispatch

The Gateway MUST support the declared runtimes:

- Gemini;
- OpenRouter;
- Codex.

Provider output MUST be converted to generic Agent events, without leaking credentials or raw secrets.

**Current status:** Gemini/OpenRouter are `VERIFIED-DEV` at the Phase 6B checkpoint. Codex source exists but managed owner auth/live acceptance is `OPEN` because the required enabled owner auth material was not verified.

### FR-006 Chat→Gateway dispatch

A durable dispatcher/worker MUST:

1. claim a queued turn exactly once;
2. load owner/thread/runtime/model context;
3. call the private Gateway using authenticated service identity plus required request binding;
4. append runtime events into Chat storage through the internal Chat API contract;
5. handle retry, terminal error, cancellation, and crash recovery without duplicate effects.

**Current status:** `OPEN` and on the critical path. The Chat API currently persists queued work but does not dispatch it.

### FR-007 Approvals

- Sandbox-sensitive operations MUST bind approval to owner, thread, turn, request, operation, parameter digest, scope, and expiry.
- UI MUST expose approve/deny exactly for the bound request.
- Approval events and terminal resolution MUST be auditable.

**Current status:** `DONE-CODE` across security/storage/UI checkpoints; real end-to-end runtime acceptance remains `OPEN`.

### FR-008 MCP tools

The Gateway MUST support owner-bound MCP discovery, call, cancellation, and disconnect. Tool execution MUST preserve owner/session isolation and must not embed another owner’s token in global configuration.

**Current status:** internal Gateway routes and MCP Host are `DONE-CODE`; real omniAgent MCP discovery/call and UI management are `OPEN`.

### FR-009 Janus bounded context

omniAgent MAY consume Janus only through approved bounded authenticated API/MCP. It MUST NOT read Janus databases, object stores, Iceberg, or internal packages directly.

Owner mapping and user-specific context authorization MUST be proven with more than one owner before acceptance.

**Current status:** client/source boundary exists, but live turn routing is not wired; `OPEN` for real integration acceptance.

### FR-010 Skills

- Skill content MUST be versioned and owner-bound.
- Skill revisions MUST reject persisted credential fields.
- Current revision/enabled state MUST be explicit.
- Public management APIs/UI MUST be provided before Skills are considered user-available.

**Current status:** storage/migration methods are `DONE-CODE`; public management API/UI and historical migration are `OPEN`.

### FR-011 Generic Chat UI

The Flutter UI MUST provide:

- sign-in;
- thread list/create/select/fork;
- runtime/model selection on new thread;
- event rendering for messages, tools, approvals, citations, usage, completion/cancel/error;
- queued-turn cancellation;
- responsive desktop/mobile layout;
- explicit not-yet-wired states for Tools/Skills/Data Sources rather than fabricated data.

**Current status:** `DONE-CODE` as a UI source checkpoint; deployed OAuth/E2E acceptance remains `OPEN`.

### FR-012 Storage migration and cutover

Before omniAgent becomes the live writer:

- create/validate an independent logical Chat database + role;
- apply `001_chat_ownership.sql` and `002_skill_storage.sql` through a repeatable migration path;
- verify owner mapping and any required historical export/copy/verify;
- prove rollback/reverse-sync for any data written after cutover;
- switch routing only with explicit approval;
- keep Janus historical data intact until reconciliation is accepted.

**Current status:** migrations and a dev setup script exist in source; application/live data migration and write cutover are `OPEN`.

## 4. Non-functional requirements

### NFR-001 Security

- no credential fields in persisted events/Skills;
- no secrets in frontend bundles, image layers, build substitutions, request logs, or repository;
- least-privilege service identities and per-service Secret access;
- authenticated internal service calls;
- no trust in user-supplied owner IDs without verified binding.

### NFR-002 Reliability

- idempotency keys for retried writes;
- deterministic event ordering and replay;
- retry-safe dispatch ownership;
- explicit terminal turn states;
- rollback procedures tested before traffic/write ownership changes.

### NFR-003 Auditability

Every acceptance claim MUST identify:

- source commit;
- build/test result;
- deployed service/revision/image when applicable;
- exact environment;
- integration path exercised;
- known skipped/unverified gates.

### NFR-004 Cost governance

No new paid resource, capacity expansion, scanning/analysis feature, trigger, HA/replica, or production resource should be inferred as approved merely because deployment code exists. Cost-impacting actions require explicit approval.

## 5. Current implementation truth table

| Capability | Source | Real dev evidence | Live/cutover accepted |
| --- | --- | --- | --- |
| Gateway service | Present | Private candidate deployed | No |
| Gemini dispatch | Present | Passed real provider probe | No overall cutover claim |
| OpenRouter dispatch | Present | Passed real provider probe | No overall cutover claim |
| Codex bridge/auth | Present | Managed auth not accepted | No |
| MCP Host | Present | Janus MCP guard separately checked; omniAgent real MCP path not accepted | No |
| Janus context client | Present | Not wired into real turn path | No |
| Chat API | Present | Source/tests only at checkpoint | No |
| `omni_chat` migrations | Present | DB not evidenced as applied at checkpoint | No |
| Flutter Chat UI | Present | Image built at checkpoint; latest sign-in source is newer | No |
| Google ID-token UI integration | Present on latest main | Latest head has no attached CI/status evidence in this review | No |
| Chat→Gateway worker/dispatcher | Absent as integrated durable path | No | No |
| Historical copy / reverse-sync rollback | Not complete | No | No |

## 6. Completion definition

`OMNIAGENT SPLIT COMPLETE` may be declared only after all of the following are true:

1. required source is implemented;
2. exact-head tests/CI pass;
3. real dev deployment is verified end to end;
4. owner isolation, OAuth, provider, MCP, Janus bounded context, approval/cancel/reconnect paths pass;
5. storage ownership and any historical migration reconcile correctly;
6. rollback/reverse-sync is proven before writer cutover;
7. Janus cleanup is performed only after the replacement is proven;
8. active documentation matches actual runtime ownership;
9. final Phase 9 acceptance is explicitly recorded as PASS.
