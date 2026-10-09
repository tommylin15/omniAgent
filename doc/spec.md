# omniAgent SPEC

> Executable baseline validated through `main@d1769491ba41670e86222536ee129b94bbfba04f`; Node Core run `37628904846` PASS. UI source baseline `12a94018debd11f5b389aa2fdf325339782bb9d8`; Flutter run `37625912746` PASS.
> Architecture revision: 2026-10-07.
> Status language distinguishes source, target design, real-dev evidence, and live acceptance.

## 1. Product objective

omniAgent is the independent generic Agent/Chat runtime and orchestration platform. It owns generic conversational runtime, Chat storage/API, worker/provider dispatch, tool/MCP orchestration, Skills, approvals, generic Flutter Chat UI, credential-selection policy, and its own historical/audit data lifecycle.

External domain systems may be integrated only through bounded authenticated API/MCP. omniAgent must not directly read external PostgreSQL/GCS/Iceberg or import external internals as runtime dependencies.

Core invariants:

- `owner_id` isolation is explicit and testable across runtime state, memory, tools, artifacts and archives;
- provider credential identity is independent from memory identity;
- raw credentials never persist in Chat/event/Skill/artifact/lakehouse content;
- PostgreSQL remains authoritative for live state-machine transitions;
- Iceberg is for historical/audit/analytics data, not the live queue/state machine;
- partial code/deployment/tests must never be reported as full acceptance.

## 2. System boundary

| Component / plane | Current/target role |
| --- | --- |
| Agent Gateway — `services/agent-gateway/` | provider/worker dispatch, Codex bridge, Gemini/OpenRouter adapters, MCP Host, approval/cancel runtime; target direct Groq adapter |
| Chat API — `services/chat-api/` | identity, owner mapping, threads, turns, events, approvals, cancellation, durable Chat ownership |
| PostgreSQL / `omni_chat` | authoritative hot state: owners, threads, turns, events, approvals, Skills, idempotency, future dispatch state, summaries and archive pointers |
| Credential plane — target | owner BYOK + entitled platform credentials resolved server-side |
| GCS artifact layer — target | large immutable message/tool/worker payloads and exports |
| Iceberg historical layer — target | long-term conversation/event/worker/tool/usage/audit history |
| BigLake/BigQuery — target | analytics/query over archived lakehouse data, not live state |
| Flutter — `apps/agent_app/` | owner Chat surface, runtime/model selection, future credential-profile controls |
| Contracts — `packages/contracts/agent.v1.json` | generic runtime/event/approval boundary |

## 3. Functional requirements

### FR-001 Identity and owner isolation

- Authenticate users with the configured identity contract.
- Persistent owner identity is issuer + subject, not email.
- Every thread, turn, event, approval, Skill, MCP session, artifact, memory/retrieval result, archive row, task/workflow record and provider session mapping is owner-bound.
- Cross-owner access must fail closed.

**Status:** Chat API identity/owner mapping is `DONE-CODE`; real browser + multi-owner acceptance is `OPEN`.

### FR-002 Thread lifecycle

Create/list/read/fork threads with idempotency and owner isolation. Runtime/model remain explicit thread properties according to the accepted API contract.

**Status:** `DONE-CODE`; live acceptance `OPEN`.

### FR-003 Turn lifecycle

A user message creates durable queued work and replayable user/event state. Turns must expose queued/running/approval/terminal states and support retry-safe cancellation semantics.

**Status:** `PARTIAL`; queued persistence exists, durable automatic dispatch does not.

### FR-004 Event transport

Events are monotonically replayable from a cursor. UI reconnect must avoid duplicate/missing events. Persisted event state is the source of truth; SSE/streaming is delivery behavior only.

**Status:** `PARTIAL`; finite SSE-formatted replay + polling exists at the reviewed source checkpoint, accepted continuous/reconnect behavior remains open.

### FR-005 Provider/worker dispatch

Target direct runtimes/providers:

- Gemini;
- OpenRouter;
- Codex;
- Groq.

Provider output must be normalized to generic Agent events.

**Status:** Gemini/OpenRouter source + previous real dev probes exist. Codex source exists but owner-auth/live acceptance remains open. Direct Groq support is `TARGET-DESIGN / OPEN`.

### FR-006 Durable Chat→Gateway dispatcher

A durable dispatcher/worker must safely claim queued turns, preserve owner/runtime/model/credential policy, authenticate to Gateway, append events, and survive retries/crashes/cancellation without duplicate externally visible effects.

PostgreSQL is authoritative for claim/turn state. A future wake-up mechanism may be added but must not replace the database as queue/state truth.

**Status:** `OPEN`, critical path.

### FR-007 Approvals

Approvals bind owner/thread/turn/request/operation/digest/scope/expiry and are auditable.

**Status:** security/storage/UI source exists; real E2E `OPEN`.

### FR-008 MCP/tools

MCP discovery/call/cancel/disconnect must preserve owner/session isolation and never use another owner's token or session.

**Status:** internal source exists; real omniAgent E2E/management `OPEN`.

### FR-009 External domain context

External domain systems may be consumed only through approved bounded authenticated interfaces. No direct storage access.

**Status:** no dedicated external-domain adapter is part of the current baseline; generic Tool/MCP/Data Source integration remains `OPEN`.

### FR-010 Skills

Skill revisions/state are versioned and owner-bound. Credential-shaped content is rejected. Public management API/UI is required before user availability is claimed.

**Status:** storage source `DONE-CODE`; public API/UI `OPEN`.

### FR-011 Generic Chat UI

Flutter must provide identity, thread/turn interaction, event rendering, approval/cancel, runtime/model selection, and explicit unavailable states rather than fabricated data.

**Status:** source checkpoint `DONE-CODE`; deployed E2E `OPEN`.

### FR-012 omniAgent storage activation and optional legacy import

Before Chat write-routing promotion: independent omniAgent DB/role, migrations, owner isolation, real dev acceptance and proven rollback/data consistency. Historical external-data import is optional unless an approved acceptance criterion explicitly requires it, and must use bounded export/import rather than direct external storage access.

**Status:** `OPEN`.

### FR-013 Credential Resolver: BYOK + platform credentials

The runtime must support credential policy independently from owner memory.

Target modes:

- `OWNER_BYOK`: owner-supplied provider key/token/auth profile;
- `PLATFORM`: platform-managed credential available only to explicitly entitled owners.

Required behavior:

1. resolve credential source on the server from authenticated owner + provider/runtime + requested profile/mode + entitlement;
2. never send raw provider credentials back to Flutter;
3. store only non-secret credential metadata/reference/status in PostgreSQL;
4. store raw secret material only in an approved secret store;
5. record non-secret credential-source metadata for audit/experiment reproducibility;
6. fail closed when an owner requests a platform credential they are not entitled to use;
7. keep Chat memory/data owner-scoped even when multiple owners use the same platform credential.

Provider credential policy must not use API-key ID, provider billing account, or shared platform account as a memory namespace.

**Status:** `TARGET-DESIGN / OPEN`; generalized resolver/entitlement source was not found at the reviewed baseline.

### FR-014 Codex owner-isolated execution context

Codex BYOK/platform auth must be separated from execution state.

Per owner, isolate the equivalent of Codex auth/session directory, thread mapping, workspace, process environment, MCP/tool session state and cancellation lifecycle. A shared platform Codex credential may authorize the provider call but must never cause owners to share writable session/thread/workspace context.

**Status:** Codex bridge source exists; generalized multi-owner BYOK/platform isolation acceptance is `OPEN`.

### FR-015 Tiered Chat data lifecycle

omniAgent must support scale without making Iceberg the live Chat database.

- PostgreSQL = hot authoritative runtime state and recent operational history.
- GCS = large immutable bodies/artifacts after verified write/digest.
- Iceberg = asynchronous immutable historical/audit/analytics archive.
- BigLake/BigQuery = optional analytical query layer after explicit approval.

Archive must preserve owner/source IDs and be idempotent/reconcilable. Preferred initial partition direction is time transform + bucket/hash(`owner_id`), not one partition per owner. Hot retention, payload threshold, compaction and expiry values remain measurement-driven and unapproved until specified.

**Status:** `TARGET-DESIGN / OPEN`; no implementation is claimed.

## 4. Non-functional requirements

### NFR-001 Security

- no raw secrets in repository, frontend, Chat/events, Skills, logs, GCS payload metadata, or Iceberg rows;
- least-privilege access to provider secret versions;
- explicit platform-credential entitlement;
- authenticated service-to-service calls;
- no trust in client-supplied owner ID;
- Codex and MCP session/context isolation across owners.

### NFR-002 Reliability

- idempotent writes and retry-safe dispatch;
- deterministic event ordering/replay;
- monotonic terminal states;
- archive failures cannot corrupt live turn state;
- archive/delete lifecycle must verify copy/digests before pruning;
- rollback tested before write-ownership changes.

### NFR-003 Auditability and experimentation

Every runtime execution should be reconstructable by owner/thread/turn/provider/model and non-secret credential source/profile, with tool/worker events, terminal state, usage and error metadata as applicable. Secret values must never be needed to reproduce the audit record.

### NFR-004 Cost governance

New buckets, BigLake/BigQuery resources, schedulers, archive jobs, secret versions, capacity, triggers, HA/replicas, paid scans, or provider platform-key budgets require explicit approval. Architecture text is not resource approval.

## 5. Current implementation truth table

| Capability | Reviewed source/evidence | Accepted current status |
| --- | --- | --- |
| Chat API + `omni_chat` source | present | source only; live storage/cutover open |
| durable dispatcher | no integrated accepted path | OPEN |
| Gemini | source + prior real Gateway probe | VERIFIED-DEV at provider probe scope |
| OpenRouter | source + prior real Gateway probe | VERIFIED-DEV at provider probe scope |
| Codex | bridge/auth source | live owner auth/isolation OPEN |
| Groq direct adapter | not found | TARGET-DESIGN / OPEN |
| BYOK/platform Credential Resolver | not found | TARGET-DESIGN / OPEN |
| owner-isolated memory | owner model/source exists | full multi-owner live acceptance OPEN |
| GCS omniAgent artifact tier | no accepted path evidenced | TARGET-DESIGN / OPEN |
| Iceberg omniAgent historical lakehouse | no accepted path evidenced | TARGET-DESIGN / OPEN |
| BigLake/BigQuery analytics layer | no approved implementation evidenced | TARGET-DESIGN / OPEN |
| event cursor replay | source exists | live reconnect acceptance OPEN |

## 6. Completion definition

omniAgent final acceptance may be declared only after exact-head implementation/CI, real dev deployment, owner isolation, enabled provider/credential modes, durable dispatch, MCP/approval/cancel/reconnect, storage/rollback and documentation gates all pass with explicit evidence. Newly approved design items are not completion evidence.


## 7. Deployment credential contract

- Owner-approved **single Secret Manager bundle**: the existing `omniagent-bundle`.
  Do not create `omniagent-provider-bundle` or a separate internal signing Secret.
- JSON fields: `gemini_api_key`, `openrouter_api_key`, `mcp_owner_signing_key`,
  `chat_database_url`. Preserve the already-approved provider keys; generate a
  cryptographically random 256-bit signing key when absent. The DB URL comes
  from the previously provisioned dedicated `omniagent-chat-db` Secret.
- Gateway env `OMNIAGENT_PROVIDER_BUNDLE=omniagent-bundle:latest` resolves provider
  keys and sets runtime `MCP_OWNER_SIGNING_KEY`; Chat candidate env
  `OMNIAGENT_BUNDLE=omniagent-bundle:latest` resolves only `chat_database_url`
  at application startup. Remove `CHAT_DATABASE_URL` from that candidate.
- This intentionally trades field-level least privilege for the owner's
  requested single-bundle policy: Chat and Gateway runtime identities can each
  read all fields when granted access to the same Secret. Both must be treated
  as highly privileged and have only narrowly scoped Secret-level access.
- Add a **new version** to the existing bundle after verifying old content
  and owner-approved DB DSN; never overwrite/destroy pinned legacy versions,
  the existing `omniagent-chat-db`, or active Cloud Run revisions during
  migration. Retire legacy DB reference only after accepted runtime cutover.
- Internal HMAC transport uses `X-OmniAgent-Timestamp` and
  `X-OmniAgent-Signature`.
- GitHub release WIF must be restricted to omniAgent GitHub main. New CI/CD publishes public GHCR images by immutable SHA-256 digest; no new Artifact Registry writer or repository is required. Missing WIF/public image/digest must fail closed.

## 8. CI/CD — GitHub Actions + public GHCR + Cloud Run (2026-10-08)

**Owner-approved TARGET-DESIGN; migration and runtime acceptance OPEN.** This
section supersedes the historical Cloud Build V2 policy for **new releases**.

Control loop: `ChatGPT → GitHub → GitHub Actions → GCP API → GitHub Actions
Logs → ChatGPT`. GitHub Actions on the exact reviewed `main` SHA performs
all Node/API/contract/security, disposable PostgreSQL, Flutter, Python and
repository quality gates, then builds/publishes the Chat (bundled Flutter),
Gateway and Shared Codex images to **GHCR**, retaining per-image immutable
`sha256` digest receipts. GHCR packages must be explicitly **Public** and
verified anonymously pullable before direct Cloud Run deployment; GitHub
repository Public visibility is insufficient.

An explicitly gated Actions release uses omniAgent-scoped WIF and GCP APIs to
create **0%-formal-traffic Cloud Run candidate revisions** from exact GHCR
digests for the three **existing** services in `us-central1`. Preserve active
revision traffic, runtime service accounts, Secrets, ingress, VPC, OAuth,
database, provider and Shared Codex caller contracts. Require exact-SHA
quality/artefact provenance, candidate revision/digest/config readback and
real Chat/Gateway/Shared integration gates before any protected promotion.
Snapshot original traffic for audit before promotion; fail closed on missing
application gates, stale SHA, overlaps, missing live candidate evidence or
traffic readback. **Owner-approved 2026-10-09 new-only recovery policy:** new
releases use only prior verified GitHub Actions → public GHCR → Cloud Run
candidate revisions as rollback targets. The earlier Cloud Build / AR
release or its rollback mechanism is **not** a prerequisite and is not
required as the recovery destination. Verify a complete three-service
GHCR fallback set independently (immutable digests, Ready, actual enabled
Secret references, signed IAM/health); then rehearse rollback and return
to the promoted GHCR release with actual route readbacks. On partial
promotion failure, route to the independently verified GHCR fallback set;
never silently rely on old serving images. If no validated new-only
fallback is available, BLOCK formal promotion rather than fabricate a
successful rollback. No synthetic approval or application gate skip.

**Post-success retention policy:** after real integration/rollback rehearsal,
successful promotion and traffic readback, the final pipeline job keeps
the newest **10 Cloud Run revisions per existing service** (or all when
fewer than ten exist). The approved new-GHCR 100%-traffic revision and
its verified **previous GHCR** rollback target must both fall within
the ten newest revisions; otherwise cleanup is BLOCKED rather than
sacrificing new-only recovery. No old AR rollback target is required. Failed candidate revisions may also be in the ten;
the count does not certify ten validated releases. Delete only older
untagged/zero-traffic revisions; never remove a serving, tagged, or
protected revision. Stale SHA, missing readback, latest revision
unready, traffic split, altered service state or protected version
outside the ten must BLOCK deletion, leaving more than ten if necessary.
Dry-run, revalidate before each delete and read back afterwards.
No image deletion: GHCR, legacy GCS and Artifact Registry assets are
outside this policy. Source/publish-only Actions never trigger cleanup.
Idle Cloud Run revisions are generally not billed for compute, except
when resource/billing settings or tagged requests keep instances running.

The **new delivery pipeline must not invoke Cloud Build/triggers, push Docker
images to Artifact Registry, write CI/CD evidence/source/locks into GCS or
create Compute Engine**. Managed Cloud Run image import/caching is not an
explicit pipeline write. Historical Cloud Build/GCS/Artifact Registry resources
remain audit/recovery history and are not deleted in this migration. Separately
approved *application runtime* GCS/Iceberg data lifecycle is unaffected.

A separate **optional read-only legacy diagnostic** Actions workflow may use
WIF and least-privilege GCP build metadata read access to inspect *existing*
Cloud Builds; publish actual `SUCCESS`/`FAILURE`/other status, failed step IDs,
failure category and a bounded **redacted error summary** into Actions logs
for ChatGPT. It may not create/retry builds, invoke triggers, dump raw logs,
read Secrets or mutate GCS/Artifact Registry. This diagnostic does not make
Cloud Build a new release dependency.

**Acceptance stages:** exact-commit complete Actions quality; three verified
public GHCR digests; WIF/IAM; 0%-candidate revisions/readbacks; live integration
and real recovery; protected traffic/rollback readback; only then verified
retirement of old push/release Cloud Build triggers. Until all are evidenced,
status is **PARTIAL/OPEN**, not DONE. Source workflows are incomplete at
this checkpoint. [New runbook](../docs/cicd-ghcr-actions-runbook.md),
[acceptance](acceptance.md), and [TODO](todo.md) govern execution.
