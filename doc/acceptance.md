# omniAgent acceptance matrix

## CI/CD V2 checkpoint — ACTIVE / PARTIAL

Four paths: Chat API, Flutter bundled in Chat, Gateway, Shared Codex. Main Push
CI and explicit full-SHA Release are separate. Source safety checks are executable
in `tests/test_cicd_v2.py`; cloud/live proof is pending. Existing provider Secret
absence, human Google Web identity and durable dispatcher gates stay OPEN.
No canonical release, image cleanup or CLOSED claim is made from source tests.

Evidence and operator commands: [V2 runbook](../docs/cicd-v2-runbook.md).

> Executable baseline validated through `main@d1769491ba41670e86222536ee129b94bbfba04f`; Node Core run `37628904846` PASS. UI source baseline `12a94018debd11f5b389aa2fdf325339782bb9d8`; Flutter run `37625912746` PASS.
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
| exact-head quality | Node + Flutter CI/tests tied to deploy commit | PARTIAL — both pass separately; final single commit gate open |
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
- [ ] authenticated internal service calls using omniAgent-owned identity and `X-OmniAgent-*` HMAC headers;
- [ ] no direct omniAgent access to any external system's DB/GCS/Iceberg;
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

The project must not be called final-accepted or production-complete until explicit Phase 9 PASS with exact source, CI, deployment, provider/credential isolation, storage lifecycle, rollback and documentation evidence.


## 10. omniAgent credential/deployment wiring gate

- [x] Gateway reads `OMNIAGENT_PROVIDER_BUNDLE`.
- [x] provider bundle contract includes `mcp_owner_signing_key` → `MCP_OWNER_SIGNING_KEY`.
- [x] no active config depends on `omniagent-internal-signing-key`.
- [x] Node Core run `37628904846` PASS after the ownership cleanup.
- [ ] `OMNIAGENT_GCP_WIF_PROVIDER` configured and preflight PASS.
- [ ] `OMNIAGENT_GCP_CI_SERVICE_ACCOUNT` configured and proven least-privilege.
- [ ] `OMNIAGENT_ARTIFACT_REPOSITORY` configured and readable/writable by the approved build/deploy identity.
- [ ] live Cloud Run configuration proves the provider bundle is injected without exposing its value.
