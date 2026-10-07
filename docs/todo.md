# omniAgent split execution status

> Updated architecture planning: 2026-10-07.
> Historical checkpoint statuses remain evidence-based; newly documented architecture items are targets until implemented and accepted.

## Completed checkpoints

- [x] Phase 0 — Baseline / freeze.
- [x] Phase 1 — independent omniAgent repository/build/test boundary.
- [x] Phase 2 — generic Agent contract/security split.
- [x] Phase 3 — bounded Janus connector/source boundary; direct Janus DB/GCS/Iceberg access is forbidden.
- [x] Phase 4 — target Chat API/`omni_chat` ownership and Skill storage source checkpoint.
- [x] Phase 5 — generic Flutter Chat source extraction.

These are migration checkpoints, not proof of live cutover.

## Phase 6 / 6B

- [x] Phase 6 deployment planning gate recorded.
- [ ] Phase 6B full real-dev acceptance.

Recorded Phase 6B evidence is **partial**: private Gateway + real Gemini/OpenRouter dispatch passed and a Chat/UI image was built, but durable Chat→Gateway dispatch, live Chat/UI acceptance, Codex owner auth, multi-owner E2E, storage cutover and final routing switch remain open.

## 2026-10-07 architecture decisions to carry forward

The following are now the target architecture and must be reflected in implementation work without being reported as completed:

- [ ] Keep PostgreSQL/`omni_chat` as authoritative **hot operational state** for owner/thread/turn/event/approval/Skill/dispatch/idempotency/cursor state.
- [ ] Add an owner-bound GCS artifact/object tier for large immutable message bodies, attachments, tool/worker outputs and exports when lifecycle thresholds are defined.
- [ ] Add asynchronous GCS + Iceberg historical/audit/analytics archive; do not use Iceberg as the live queue/state machine.
- [ ] Evaluate/implement BigLake/BigQuery analytics over archived data only after explicit resource/cost approval.
- [ ] Prefer time partitioning plus bucket/hash on `owner_id`; do not create one physical Iceberg partition per owner by default.
- [ ] Implement a provider Credential Resolver supporting owner BYOK and entitled platform credentials.
- [ ] Keep raw secrets in approved secret storage; persist only metadata/reference/status in PostgreSQL.
- [ ] Enforce owner memory isolation independently from credential source. A shared platform provider key must never merge threads, summaries, tools, artifacts or historical records.
- [ ] Add direct Groq provider support as an experimental target. Current source has no Groq adapter.
- [ ] Isolate Codex auth/session/thread/workspace/process context per owner even when a platform Codex credential is reused.
- [ ] Persist only non-secret credential-source metadata for audit/experiment reproducibility.

## Current critical path

1. exact-head build/test evidence;
2. independent dev Chat DB/role + migrations;
3. deploy Chat API + Flutter candidate without taking existing live traffic;
4. real browser Google sign-in and two-owner isolation;
5. implement durable Chat→Gateway dispatcher/worker;
6. implement/accept credential resolution and enabled provider auth modes;
7. prove Gemini/OpenRouter and, when implemented, Groq/Codex end to end;
8. prove approval/cancel/reconnect/MCP;
9. add the historical archive/lifecycle path before relying on it for scale or retention;
10. perform historical migration/rollback/cutover only with explicit approval.

## Later phases

- [ ] Phase 7 — cleanup only after Phase 6B replacement is proven.
- [ ] Phase 8 — reconcile active docs and stale references with actual runtime.
- [ ] Phase 9 — exact-head CI + deployment + live integration + storage + isolation + rollback + docs final acceptance.

Only explicit Phase 9 PASS may be labeled `OMNIAGENT SPLIT COMPLETE`.
