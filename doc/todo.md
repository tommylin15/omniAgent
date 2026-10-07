# omniAgent TODO

> Executable ownership-cleanup baseline validated through `main@d1769491ba41670e86222536ee129b94bbfba04f`; Node Core run `37628904846` PASS. UI source baseline `12a94018debd11f5b389aa2fdf325339782bb9d8`; Flutter run `37625912746` PASS.
> Architecture revision: 2026-10-07.
> Code/migration/infra work listed here must be executed through the approved development flow; documentation updates are not implementation.

## UI v1 development kickoff

- [x] **UI v1 Slice 1 — SOURCE-READY / LIVE ACCEPTANCE OPEN.**
  - Work order: GitHub Issue #1; kickoff comment `6036339623`; patch blueprint `6038169430`.
  - Exact-head pre-change baseline: `main@ce3c96a264cd5ffcb18e1d1a157b98baa489e05e`, GitHub Actions run `37623987916` — `flutter pub get`, `flutter analyze lib test`, `flutter test`, `flutter build web` all PASS.
  - Implementation commit: `d0974f03d79aa959c1164dbcd35657784d2119b4`.
  - Changed source only: centralized Warm Cozy theme/tokens, sign-in/config surface, new-thread empty state, replaceable Twin Beast mascot slot, presentation assertions.
  - Exact-head post-change run `37624738722` — all four Flutter gates PASS.
  - Diff review confirms no `ChatApi`, services, contracts, migration, infra or deploy change; create/send/event/approval/cancel behavior and `assistantProfile=default` remain unchanged.
  - Slice 1 is source-ready only. Deployed browser/mobile visual acceptance is still open and UI v1 is not complete.

- [x] **UI v1 Slice 2 — SOURCE-READY / LIVE ACCEPTANCE OPEN.**
  - Main implementation: `3e84083bed8992b5f67bb32504956320fca05a18`; presentation-only changes to thread navigation, selected state, conversation header/truthful event-sync status, message/event/approval/queued/composer surfaces, and existing Tools/Skills/Data Sources sheet.
  - First CI run `37625610515`: analyze PASS, test FAIL because the new locked-approval UI used a perpetual `CircularProgressIndicator`, causing the existing `pumpAndSettle` test to time out; build was skipped.
  - Fix commit: `12a94018debd11f5b389aa2fdf325339782bb9d8` replaces the perpetual animation with a static processing indicator; approval semantics were not changed.
  - Re-validation run `37625912746`: `flutter pub get`, `flutter analyze lib test`, `flutter test`, and `flutter build web` all PASS.
  - Diff review remains presentation/test only; no ChatApi/service/contract/migration/infra/deploy semantic changes and no Groq UI.
  - Slice 2 is source-ready only. Browser/mobile deployed visual acceptance and production Twin Beast asset ingestion remain open.

- [ ] **UI v1 next gate — DEPLOYED VISUAL ACCEPTANCE / ASSET PIPELINE.**
  - Keep the current replaceable abstract Twin Beast slot until a production asset is explicitly selected/ingested.
  - Next visual evidence should cover real browser/mobile layout, long chats, approval cards, code blocks, keyboard/composer behavior and responsive breakpoints.
  - Deployment is authorized for omniAgent. Current blocker is omniAgent-owned GitHub→GCP configuration; preflight run `37628839968` fails closed because `OMNIAGENT_GCP_WIF_PROVIDER` is not configured.

## P0 — real Phase 6B blockers

- [ ] **Exact-head CI/test for the deploy candidate.**
  - Node Core run `37628904846` PASS after Gateway/bundle/header/build cleanup; Flutter run `37625912746` PASS for UI source. A single final deploy commit still needs both gates tied together.

- [ ] **Create/verify independent dev Chat DB/role and apply 001/002.**
  - Real schema/read-write evidence; no direct mutation of external-system storage.

- [ ] **Deploy Chat API + Flutter candidate without writer cutover.**
  - Immutable revision/image, health/UI/protected API smoke.

- [ ] **Real browser identity + at least two-owner isolation.**
  - Stable issuer+subject mapping; cross-owner thread/event/approval/Skill access rejected.

- [ ] **Implement durable Chat→Gateway dispatcher/worker.**
  - Transactional claim, retry/cancel/crash recovery, authenticated Gateway call, idempotent event append.
  - PostgreSQL remains authoritative queue/turn state.

- [ ] **Implement Credential Resolver and entitlement policy.**
  - Inputs: authenticated owner, provider/runtime, requested credential mode/profile, entitlement.
  - Modes: owner BYOK and entitled platform credential.
  - Raw secret never returned to Flutter or persisted in Chat/event/Skill/lake payloads.

- [ ] **Implement owner BYOK secret lifecycle for enabled providers.**
  - Secure create/replace/revoke/validate through an approved secret store; PostgreSQL keeps only metadata/reference/status.
  - No raw credential in logs or browser storage.

- [ ] **Prove platform-key isolation.**
  - Two owners may use the same platform provider credential while retaining separate threads, summaries, tools, artifacts, approvals, memory/retrieval results and archive records.
  - Unauthorized owner cannot select platform credential.

- [ ] **Complete enabled provider E2E.**
  - Gemini + OpenRouter through real Chat path.
  - Codex requires owner auth plus owner-isolated execution context.
  - Direct Groq is a new implementation item and cannot be tested/claimed until its adapter exists.

- [ ] **Codex owner-isolated execution context.**
  - Isolate equivalent auth/session directory, thread mapping, workspace, environment, process and MCP/tool state per owner.
  - Shared platform Codex authorization must not create shared session/workspace/memory.

- [ ] **Runtime approval/cancel/reconnect/MCP E2E.**

## P1 — data lifecycle and experiment platform

- [ ] **Add direct Groq provider adapter and generic event conversion.**
  - Unit/contract tests + real dev provider probe + full Chat E2E.

- [ ] **Add credential-management API/UI.**
  - Personal vs Platform source visible; full secret never redisplayed.
  - replace/revoke/status/last-validated behaviors.

- [ ] **Define measured hot-data and large-payload thresholds.**
  - Do not hard-code an arbitrary retention period without workload evidence.

- [ ] **Add owner-bound GCS artifact/object tier.**
  - Large immutable message bodies, attachments, tool/worker output and exports.
  - Persist digest/size/media/reference metadata; authorization checked on read.

- [ ] **Build asynchronous Iceberg historical archive.**
  - Archive conversation events, worker/tool executions, provider usage, approval audit and workflow/task history as applicable.
  - Idempotent writes and source/archive reconciliation.
  - Iceberg must not drive live QUEUED/RUNNING/APPROVAL/terminal transitions.

- [ ] **Define/tune Iceberg partition/compaction/snapshot lifecycle.**
  - Start from time transform + bucket/hash(`owner_id`); verify with actual file/query metrics.

- [ ] **Add authorized historical reconstruction path.**
  - UI/Chat API retrieves owner-authorized history via service logic; clients do not directly query the lake.

- [ ] **Evaluate BigLake/BigQuery analytics only with explicit resource/cost approval.**
  - Bounded queries, measurable use case, no accidental production scans.

- [ ] **Replace/upgrade two-second polling with accepted streaming/reconnect behavior.**
  - Persisted cursor remains source of truth.

- [ ] **Complete Tool/MCP, Skill and bounded Data Source management UI/API.**

## P2 — migration/cutover/finalization

- [ ] Optional historical external-data import only if explicitly required; use approved export/copy/verify, never direct external storage access.
- [ ] Prove omniAgent rollback/data consistency before any write-routing promotion.
- [ ] Promote omniAgent routing/write ownership only after mandatory acceptance gates pass.
- [ ] Execute cleanup only after replacement is live-accepted.
- [ ] Reconcile active docs with runtime and remove stale current-state claims without erasing history.
- [ ] Phase 9 final acceptance: source + CI + deployment + integration + credential isolation + storage lifecycle + rollback + docs.

## Already evidenced / not upgraded by this revision

- [x] independent omniAgent repo/build boundary;
- [x] generic Agent contract/security split;
- [x] bounded generic external-source boundary;
- [x] target Chat API/`omni_chat` source;
- [x] generic Flutter Chat source;
- [x] private Gateway candidate at the recorded checkpoint;
- [x] real Gemini provider probe at the recorded checkpoint;
- [x] real OpenRouter provider probe at the recorded checkpoint.

The 2026-10-07 credential/lakehouse decisions are `TARGET-DESIGN`, not completed work.


## 2026-10-07 ownership / credential cleanup

- [x] Gateway bundle env renamed to `OMNIAGENT_PROVIDER_BUNDLE`.
- [x] Internal HMAC headers renamed to `X-OmniAgent-Timestamp` / `X-OmniAgent-Signature`.
- [x] `omniagent-provider-bundle.mcp_owner_signing_key` is the signing-key source.
- [x] Obsolete `omniagent-internal-signing-key` dependency removed from acceptance config; that Secret must not be recreated.
- [x] legacy Artifact Registry hard-code removed from `cloudbuild.yaml`; image repository must be supplied explicitly.
- [x] Node Core CI added and run `37628904846` PASS.
- [x] Repo-side deployment identifiers and idempotent GCP bootstrap are defined for `OMNIAGENT_GCP_WIF_PROVIDER`, `OMNIAGENT_GCP_CI_SERVICE_ACCOUNT`, and `OMNIAGENT_ARTIFACT_REPOSITORY`.
- [ ] Execute/read back the omniAgent GCP bootstrap and require a new preflight PASS before marking GitHub→GCP deployment identity configured.
