# omniAgent TODO

> Baseline: `main@4a5f74ca60c0859a8727568290b388101cbae6c1`.
> Priority reflects the critical path to a real Phase 6B acceptance, not feature desirability.

## P0 — Phase 6B blockers

- [ ] **Run exact-head CI/test evidence for latest `main`.**
  - Acceptance: Node build/tests + Flutter analyze/tests/build are tied to the same commit that will be deployed.
  - Reason: latest source changed Google sign-in and added Chat candidate/DB setup support after the prior Phase 6B evidence checkpoint; current review found no attached workflow/status evidence for the head commit.

- [ ] **Create and verify the dev Chat logical database/role.**
  - Source already exists: `setup-omniagent-db-dev.sh`.
  - Acceptance: independent DB/role created, credentials injected via approved Secret path, migrations run transactionally, `omni_chat` tables verified, no Janus data/schema modified unexpectedly.

- [ ] **Apply and verify `001_chat_ownership.sql` and `002_skill_storage.sql`.**
  - Acceptance: schema objects match expected ownership, constraints/indexes exist, real read/write smoke passes, rerun/rollback behavior is understood.

- [ ] **Deploy Chat API + Flutter Web candidate without taking Janus live traffic.**
  - Acceptance: immutable image digest, private/approved service configuration, `/health`=200, `/` serves Flutter, protected `/v1/threads` rejects unauthenticated access, no Janus routing change.

- [ ] **Complete real browser Google sign-in.**
  - Source already exists for Google ID-token integration.
  - Acceptance: actual origin is configured, Google login returns an ID token for the omniAgent client audience, Chat API accepts it, owner mapping is stable across sessions, invalid audience/token is rejected.

- [ ] **Implement the durable Chat→Gateway dispatcher/worker.**
  - This is a code task and should be executed through Codex/Work/local development, not by ChatGPT documentation editing.
  - Required behavior: claim queued turns safely, invoke the private Gateway, append events, handle retries/cancel/crash recovery, avoid duplicate side effects.
  - Acceptance: real user message becomes a provider response through Chat API → dispatcher → Gateway → Chat events → UI.

- [ ] **Prove end-to-end Gemini and OpenRouter Chat paths through the Chat API/UI.**
  - Existing real Gateway provider probes are useful but are not Chat E2E.
  - Acceptance: real browser-created thread/message reaches the selected runtime and returns terminal events to the same owner.

- [ ] **Prove runtime-aware approval and cancellation end to end.**
  - Acceptance: approval request is bound to exact owner/thread/turn/request/digest/expiry; approve and deny each affect only the intended request; cancellation reaches the runtime and terminal state is persisted once.

- [ ] **Prove multi-owner isolation.**
  - Acceptance: at least two owners; cross-owner thread/event/approval/Skill/Codex/MCP/context access is rejected; no global user token is used as a multi-owner shortcut.

- [ ] **Wire real bounded Janus context into the turn path.**
  - Acceptance: only authenticated Janus bounded API/MCP is used; no direct Janus DB/GCS/Iceberg/source access; owner mapping and authorization are proven.

- [ ] **Prove omniAgent MCP discovery and call.**
  - Acceptance: real configured MCP endpoint, owner/session binding, discover + call + cancel/disconnect as applicable, safe tool event persistence.

- [ ] **Enable and verify Codex managed owner auth before claiming Codex runtime readiness.**
  - Acceptance: valid owner auth Secret version, owner-specific login/session state, turn execution, rotation/persistence behavior, cleanup/logout, no cross-owner bundle exposure.

## P1 — required before any live writer cutover

- [ ] **Replace/upgrade two-second polling with accepted live event delivery semantics.**
  - Current source emits a finite SSE-formatted response and the Flutter client reconnects by polling every two seconds.
  - Acceptance: continuous or explicitly bounded streaming design, reconnect cursor behavior, duplicate/missing-event tests, network interruption recovery.

- [ ] **Add a public Skill management API.**
  - Storage and versioning exist, but user-facing routes do not.
  - Acceptance: create revision, list/read state, enable/disable/select revision, owner isolation, validation, audit trail.

- [ ] **Build Skill management UI.**
  - Acceptance: current placeholder is replaced by real owner-scoped management backed only by omniAgent APIs.

- [ ] **Build Tools/MCP management UI/API.**
  - Acceptance: configured tools can be discovered and managed without exposing credentials; UI must not call legacy Janus `/api/v1/me/*` generic assistant routes.

- [ ] **Build bounded Data Source/context selection UI.**
  - Acceptance: only authorized Janus bounded sources are displayed; source selection is attached to the intended turn/thread and audited.

- [ ] **Perform historical owner mapping/export-copy-verify if the approved cutover requires it.**
  - Acceptance: deterministic owner mapping, record counts/digests, no destructive move, discrepancies reported rather than hidden.

- [ ] **Design and prove reverse-sync rollback.**
  - Blocking for Chat write ownership switch.
  - Acceptance: writes made after omniAgent cutover can be reconciled safely back to the rollback writer or otherwise recovered without silent loss/duplication.

- [ ] **Obtain explicit routing/write-ownership cutover approval.**
  - Acceptance: all blocking gates passed and rollback evidence attached; traffic change is separately authorized.

## P2 — after Phase 6B acceptance

- [ ] Execute Phase 7 Janus cleanup only for generic ownership already replaced by omniAgent.
- [ ] Preserve Janus investment-domain/API/MCP/UI responsibilities and historical migration records.
- [ ] Run both-repository regressions and stale import/path scans after cleanup.
- [ ] Reconcile active `README`, `docs/`, and this `doc/` set so current-state ownership claims agree.
- [ ] Remove or label superseded current-state statements without deleting historical evidence.
- [ ] Perform Phase 9 final acceptance and record a single explicit PASS/FAIL result.

## Completed / already evidenced checkpoints

- [x] Independent omniAgent repository/build boundary.
- [x] Generic Agent contract/security split from Janus domain policy.
- [x] Bounded Janus client/source boundary with no direct Janus DB/GCS/Iceberg imports.
- [x] Target Chat API/storage schema and owner mapping source.
- [x] Flutter generic Chat source extraction.
- [x] Phase 6 deployment plan.
- [x] Private Gateway candidate build/deploy at the recorded Phase 6B checkpoint.
- [x] Real Gemini provider probe at the recorded Phase 6B checkpoint.
- [x] Real OpenRouter provider probe at the recorded Phase 6B checkpoint.
- [x] Chat/UI candidate image build at the recorded Phase 6B checkpoint.
- [x] Latest source includes Google ID-token sign-in integration.
- [x] Latest source includes Chat candidate smoke configuration and dev DB setup script.

These checked items are not equivalent to `OMNIAGENT SPLIT COMPLETE`.
