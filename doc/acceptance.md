# omniAgent acceptance matrix

> Implementation baseline reviewed: `main@75336a248381d935c7b23dd8afab06f5e9c4151a`.
> Architecture revision: 2026-10-07.
> Code/design presence cannot substitute for runtime evidence.

## 1. Evidence hierarchy

1. live/runtime/deployment evidence;
2. real environment acceptance;
3. exact-commit CI/test evidence;
4. source evidence;
5. planning/document evidence.

New credential/lakehouse design items in this revision are level 5 until implementation evidence exists.

## 2. Existing checkpoint summary

Recorded Phase 6B evidence previously demonstrated a private omniAgent Gateway candidate and real Gemini/OpenRouter provider probes. It did not demonstrate full Chat/UI deployment, durable Chat→Gateway dispatch, live Chat DB cutover, Codex owner auth, direct Groq, generalized BYOK/platform credentials, omniAgent Iceberg archive, or final writer cutover.

## 3. Core Phase 6B gates

| Area | Required evidence | Current |
| --- | --- | --- |
| exact-head quality | Node + Flutter CI/tests tied to deploy commit | OPEN |
| Chat DB | independent DB/role + applied migrations + real R/W | OPEN |
| Chat candidate | deployed revision/image + smoke | OPEN |
| OAuth/owner | real browser + stable issuer/subject | OPEN |
| multi-owner isolation | positive/negative tests across Chat/resources | OPEN |
| durable dispatch | Chat→dispatcher→Gateway→events trace | OPEN |
| Gemini full E2E | UI to terminal provider result | OPEN |
| OpenRouter full E2E | UI to terminal provider result | OPEN |
| Codex | owner auth + isolated execution + real turn | OPEN |
| Groq | adapter + real provider + full Chat E2E | OPEN / NOT IMPLEMENTED |
| approval/cancel/reconnect | real runtime/network cases | OPEN |
| MCP/tools | real endpoint + owner/session isolation | OPEN |
| routing cutover | explicit approval after blockers | BLOCKED |

## 4. Credential plane acceptance

Before BYOK/platform credential support may be called accepted:

- [ ] raw secret is stored only in approved secret storage;
- [ ] PostgreSQL contains only owner/provider/mode/profile metadata/reference/status, never raw secret;
- [ ] Flutter never receives the stored raw secret after submission;
- [ ] logs, events, Skills, GCS artifacts and Iceberg rows contain no raw secret;
- [ ] Owner A BYOK cannot be selected/read/used by Owner B;
- [ ] platform credential requires explicit entitlement;
- [ ] non-entitled owner fails closed when requesting platform mode;
- [ ] two owners can use the same platform credential while all memory/thread/tool/artifact/archive state remains separate;
- [ ] audit can identify provider/model and non-secret credential source/profile used for a turn;
- [ ] credential replace/revoke/rotation behavior is tested.

## 5. Codex isolation acceptance

For both personal and platform Codex authorization:

- [ ] owner-specific auth/session execution boundary;
- [ ] owner-specific Codex thread/session mapping;
- [ ] owner-specific workspace/working directory;
- [ ] owner-specific environment/process/tool/MCP context;
- [ ] cancellation cannot target another owner's process/turn;
- [ ] shared platform authorization does not create shared writable session/cache/workspace;
- [ ] cross-owner negative tests prove no transcript/context bleed.

## 6. Data lifecycle/lakehouse acceptance

Before the historical lakehouse is relied on for retention/scale:

- [ ] PostgreSQL remains authoritative for live turn state;
- [ ] large GCS payloads are owner-bound and digest-verified;
- [ ] archive writer is idempotent and restart-safe;
- [ ] archive records preserve owner/thread/turn/event/source IDs;
- [ ] source/archive counts and digests reconcile for sampled and bounded full ranges;
- [ ] archive failure cannot silently mark a live turn complete or delete hot state;
- [ ] physical partition strategy is measured; no unbounded one-partition-per-owner design;
- [ ] compaction/snapshot expiry/retention behavior is tested before scheduled automation;
- [ ] historical conversation reconstruction preserves order and owner authorization;
- [ ] hot-data pruning happens only after archive verification and explicit lifecycle approval;
- [ ] BigLake/BigQuery resources/queries have explicit cost/resource approval and bounded-query evidence.

## 7. Security acceptance

- [ ] authenticated owner binding; no client-supplied owner trust;
- [ ] authenticated internal service calls;
- [ ] no direct omniAgent access to Janus DB/GCS/Iceberg;
- [ ] approval binding includes owner/thread/turn/request/digest/expiry;
- [ ] MCP sessions cannot cross owners;
- [ ] provider secrets never become Chat memory or analytics data;
- [ ] wrong-audience/expired/unauthorized credential requests fail closed.

## 8. Reliability acceptance

- [ ] retry-safe queued claim;
- [ ] duplicate dispatch does not duplicate externally visible effects;
- [ ] monotonic event sequence and terminal state;
- [ ] crash between provider call and event persistence has recovery semantics;
- [ ] reconnect resumes from persisted cursor;
- [ ] cancellation races tested;
- [ ] archive retries are independent from live turn correctness;
- [ ] rollback/reverse-sync is rehearsed before writer switch.

## 9. Documentation/final rule

Active README/SPEC/WBS/TODO/UI/acceptance/storage/architecture docs must match actual runtime. Point-in-time evidence remains traceable.

The phrase `OMNIAGENT SPLIT COMPLETE` is prohibited until explicit Phase 9 PASS with exact source, CI, deployment, provider/credential isolation, storage lifecycle, rollback and documentation evidence.
