# omniAgent TODO

## Current delivery scope — NEW GitHub Actions → GHCR → Cloud Run only (2026-10-09)

The operator explicitly excludes investigation/cleanup of legacy CI/CD
Cloud Run revisions, historical Docker images, Cloud Build and GCS assets
from the active completion path. Manual asset cleanup was reported by the
operator; do not turn it into a prerequisite or treat unverified cleanup
as a newly audited PASS. Preserve non-omniAgent data and backup safety.

- [x] Latest source-quality and three immutable public GHCR image publications
  for code SHA `e3475d3aade0fd8061d832d2dd4a0af45a8892ac`:
  [GHCR Actions #37867383817](https://github.com/tommylin15/omniAgent/actions/runs/37867383817).
  Flutter auth-account switch State isolation with widget regression test:
  [Flutter #37867383811](https://github.com/tommylin15/omniAgent/actions/runs/37867383811).
- [x] Latest 0%-traffic candidates: Chat `omniagent-chat-00029-nux`,
  Gateway `omniagent-agent-gateway-00020-nef`, Shared
  `omniagent-shared-codex-00013-kop`:
  [candidate #37867853618](https://github.com/tommylin15/omniAgent/actions/runs/37867853618).
- [x] Automated `workflow_run` read-only candidate acceptance:
  `.github/workflows/omniagent-ghcr-current-candidate-smoke.yml`
  derives the release SHA and checks three zero-percent readiness/digests,
  anonymous Chat web/ready/API authorization, IAM scoped Gateway/Shared
  health/readiness and traffic preservation.
  [Live smoke #37868153663](https://github.com/tommylin15/omniAgent/actions/runs/37868153663)
  **PASS** against those candidates under the initial workflow-only push.
  The ongoing workflow is now `workflow_run`-only and SHA-derived.
  **2026-10-09 trigger observation**: a normal main push of
  `7937447dd85ef78dbabfe0ca7fd05a703dd99e3c` passed full quality and
  three GHCR image publishes [#37876825619](https://github.com/tommylin15/omniAgent/actions/runs/37876825619);
  its successful publisher automatically triggered candidate workflow_run
  [#37877047775](https://github.com/tommylin15/omniAgent/actions/runs/37877047775).
  The failed candidate in turn automatically triggered read-only smoke
  workflow_run [#37877114127](https://github.com/tommylin15/omniAgent/actions/runs/37877114127),
  whose job was correctly SKIPPED because upstream was not successful.
  **Automatic event wiring and fail-closed downstream gating: PASS.**
  **Successful three-service deployment → automatic passing smoke: NOT VERIFIED.**
- [ ] **2026-10-09 current GHCR deployment blocker (not legacy cleanup):**
  all three newly published GHCR digests were anonymously accessible in
  candidate #37877047775. Chat `omniagent-chat-00030-puq` deployed at 0%
  with serving traffic preserved. Gateway candidate failed because existing
  Cloud Run configuration still references Secret Manager
  `omniagent-bundle` version `2`, which Cloud Run reported `DESTROYED`
  for two environment secret references. Shared was not attempted.
  All three formal serving revisions read back at 100% **before** deployment;
  a post-failure three-service readback has not been obtained.
  Do not guess a replacement Secret version or mutate credentials. An authorized
  operator must validate a working Secret version and controlled runtime
  reference/compatibility before retrying the exact-SHA auto chain.
  **E2E result: BLOCKED**, not CI/CD DONE.
- [ ] **Mandatory live integration**: two *real* browser Google OAuth accounts,
  persistent owner separation and account-switch UI; approved owner/provider
  entitlement, real Chat→Gateway signed dispatch, persisted provider event
  replay and cancel/approval/reconnection/recovery evidence. Mocked and
  PostgreSQL acceptance tests alone cannot satisfy this item. The current
  Chat dispatcher is deliberately opt-in and remains disabled in candidates.
- [ ] **Mandatory Shared acceptance**: fresh real Codex provider invocation
  for each of the three approved caller identities, with wrong-project denial
  on the **current** Shared candidate SHA. Historical candidate results
  do not prove this release.
- [ ] **Release gate**: only after both live integration items pass, perform
  bounded 3-service production traffic promotion with readback, actual
  rollback rehearsal and recovery, then separately invoke revision retention
  for the *approved new delivery path*. Do not let source tests or 0%
  candidates authorize production promotion.


## Actions + GHCR + Cloud Run migration — TARGET / OPEN (2026-10-08)

### Live retirement inventory checkpoint — PARTIAL (2026-10-09)

- [x] Two legacy Cloud Build triggers manually disabled and re-verified in
  **GCP by exact IDs**, with `disabled=true` for `omniagent-main-v2` and
  `omniagent-release-v2`: [read-only Actions #37860495082](https://github.com/tommylin15/omniAgent/actions/runs/37860495082).
  This does **not** imply production GHCR traffic cutover.
- [x] Scoped read-only retirement inventory run: production traffic remains
  Chat `omniagent-chat-00004-dzs`, Gateway `omniagent-agent-gateway-00003-k6t`,
  Shared `omniagent-shared-codex-00004-xmq`, each at **100%**.
  The service templates currently name GHCR, but individual Cloud Run
  revision image references still appear as `.pkg.dev` due to Google-managed
  image importing; **do not classify these as disposable legacy AR images**.
  Revisions counted Chat 17 / Gateway 13 / Shared 12. Scoped Cloud Run job
  count returned 0, which alone cannot prove no other consumers.
- [x] AR `us-central1/omniagent` exists and exposes exactly four packages:
  `omniagent-chat`, `omniagent-agent-gateway`,
  `omniagent-shared-codex`, `omniagent-postgres`. The entire repository
  is **KEEP/BLOCKED** until the traffic/rollback/VM/PostgreSQL and other
  dependencies are proven absent.
- [ ] GCS inventory remains **BLOCKED BY IAM** under
  `omniagent-ci@gen-lang-client-0593591102.iam.gserviceaccount.com`.
  Project bucket listing was `NO_PERMISSION_OR_UNAVAILABLE`, and two
  historical Cloud Build bucket names were `NOT_READABLE_OR_NOT_FOUND`;
  neither absence nor ownership is established. Scoped AR repository-wide
  listing was also `NOT_READABLE`. Grant only narrowly scoped read-only
  metadata inventory capability, then rerun audit. No bucket/object/AR
  package deletion is approved without an exact consumer/backup manifest.
- [ ] **No deletion performed.** Post-cutover AR rollback protection and
  exclusive GCS ownership must be validated before any destructive operation.
  This is a safety BLOCK, not task completion.

### Latest GHCR dispatch checkpoint — PARTIAL (2026-10-08)

- [x] Immutable three-image publish and exact-source quality at
  `c37f132619da065786fa4f69ad125b86ba9356a9`:
  [Actions #37808634713](https://github.com/tommylin15/omniAgent/actions/runs/37808634713)
  PASS, including ephemeral PostgreSQL owner-bound event replay and Flutter Web.
- [x] 0%-formal-traffic candidates at that same source SHA:
  Chat `omniagent-chat-00028-ziw`, Gateway `omniagent-agent-gateway-00019-sim`,
  Shared `omniagent-shared-codex-00012-gej`. Three live revisions READY, prior
  Chat/Gateway/Shared AR serving revisions still 100%:
  [#37809346292](https://github.com/tommylin15/omniAgent/actions/runs/37809346292).
- [x] Pinned candidate browser/readiness/anonymous Chat API and private
  Gateway/Shared signed health [#37809679507](https://github.com/tommylin15/omniAgent/actions/runs/37809679507)
  PASS. Chat `CHAT_DISPATCH_ENABLED` is unset/disabled; anonymous
  `POST /internal/v1/chat/dispatch:once` denied 401. This is **not**
  proof of an authenticated dispatch execution.
- [x] Source-only, opt-in Chat→Gateway one-shot worker:
  PostgreSQL approved-owner UUID claim, scoped ID token, HMAC request,
  bounded event validation and owner-bound persisted terminal replay.
  It is deliberately **not auto-enabled**, has no durable trigger or
  crash-recovery replay policy, and is not a completed production dispatcher.
  [Dispatch contract](../docs/chat-gateway-dispatch.md).
- [x] Previous Shared candidate `00010-vih` (different SHA) passed real
  three-authorized-caller Codex inference, fresh-thread and wrong-project
  denial [#37791333261](https://github.com/tommylin15/omniAgent/actions/runs/37791333261).
  Earlier HTTP 502 is resolved **at that tested revision only**.
- [ ] Latest Shared `00012-gej` real three-caller inference **NOT YET TESTED**;
  updating the pinned real-inference workflow was blocked by tool safety
  controls. Do not inherit real inference PASS from `00010-vih`.
- [ ] Human Google OAuth with two separate real users, live signed
  Chat→Gateway provider execution, entitlement policy by provider,
  multi-turn history, durable wake-up, reconciliation/approval/cancel/reconnect,
  recovery drill and traffic promotion remain OPEN.
- [ ] Old Cloud Build triggers and unreferenced AR/GCS remain untouched.
  No revision retention deletion until accepted cutover and rollback.


- [x] Formal owner design documented: Actions complete CI, three GHCR public
  digest images, Cloud Run 0% candidates, acceptance/traffic/rollback, optional
  read-only old Cloud Build status bridge. [SPEC §8](spec.md#8-cicd--github-actions--public-ghcr--cloud-run-2026-10-08).
- [x] Source: expand `.github/workflows/omniagent-ghcr-publish.yml` to
  ordinary `main` code changes; quality [Actions #37767763854](https://github.com/tommylin15/omniAgent/actions/runs/37767763854)
  PASS, publish intentionally BLOCKED by stale main SHA before any GHCR image.
- [x] Observed exact-source-SHA `3cf40bc7a9223a5ce7efa630dbd837c4ff57a46a`
  full quality + all three immutable GHCR image publishes
  [#37768680175](https://github.com/tommylin15/omniAgent/actions/runs/37768680175).
- [x] All three GHCR immutable digests anonymously retrieved, including
  Shared Codex after package visibility was changed to Public; candidate
  [#37768993666 attempt 2](https://github.com/tommylin15/omniAgent/actions/runs/37768993666).
- [x] Source: `.github/workflows/omniagent-ghcr-cloudrun-candidate.yml`
  now listens only to a successful own-repo GHCR workflow run and demands
  exact-current-main, three anonymous public GHCR digests, WIF and
  0%-traffic candidate config/traffic checks. Three 0%-traffic Cloud Run
  candidates actually created and pinned in [#37768993666 attempt 2](https://github.com/tommylin15/omniAgent/actions/runs/37768993666).
- [x] Three candidate image/traffic/ready readbacks
  [#37773167073](https://github.com/tommylin15/omniAgent/actions/runs/37773167073)
  PASS; Chat homepage/JS/ready/auth and signed private health on Gateway
  and Shared [#37773639139](https://github.com/tommylin15/omniAgent/actions/runs/37773639139)
  PASS. No formal traffic promotion.
- [x] **Historical 502 reproduced and resolved for tested `00010-vih` candidate:** Shared 0%-candidate real inference gave HTTP 502
  [#37773850397](https://github.com/tommylin15/omniAgent/actions/runs/37773850397);
  old 100%-serving AR Shared control also gave 502
  [#37774120512](https://github.com/tommylin15/omniAgent/actions/runs/37774120512).
  New GHCR Codex CLI 0.153.4 binary boot [#37774590569](https://github.com/tommylin15/omniAgent/actions/runs/37774590569)
  PASS. Candidate logging not readable with current CI IAM; obtain sanitized
  failure classification, resolve runtime/provider and repeat three signed
  inference plus isolation cases. **Do not attribute this to GHCR alone**.
- [ ] Implement and validate full approved production promotion/release,
  human browser OAuth/two-owner, real Chat→Gateway/dispatcher/provider
  integration and remaining security/approval/reconnect gates.
  Candidate smoke does not imply production acceptance.
- [ ] Implement serialized safe promotion/real traffic rollback, readback,
  budget controls, stale-SHA protection and recovery evidence.
- [x] Source: post-release **keep latest 10 Cloud Run revisions per service**
  safety helper, reusable Actions last-stage job and unit tests added.
  Does not delete GHCR packages or legacy Artifact Registry/GCS resources.
  Revision count is not a guarantee of ten *accepted* releases; protect the
  last-known-good rollback target even if it falls outside the newest ten.
- [ ] Attach retention job **only after** the not-yet-complete release
  workflow's real acceptance, rollback rehearsal, successful promotion and
  traffic readback; confirm WIF `run.revisions.delete` effective permission.
- [ ] Run real safe dry-run/deletion/readback on Chat, Gateway and Shared;
  capture exact Actions run and runtime evidence. A source commit is not PASS.
  If a tagged, active or latest revision would be removed, report BLOCKED
  and keep more than ten instead of deleting unsafely.
- [ ] Extend read-only legacy Cloud Build status workflow with bounded masked
  failure summary; current workflow only prints status, failure class and steps.
- [x] Verify manual disablement of both old Cloud Build triggers using
  immutable GCP IDs in [#37860495082](https://github.com/tommylin15/omniAgent/actions/runs/37860495082).
  **Triggers are disabled ahead of accepted production cutover**; do not
  misrepresent this as complete release/rollback acceptance. Do not delete
  historical Artifact Registry/GCS assets or create VMs.
- [x] Record separate **legacy GCS and Artifact Registry retirement plan**,
  including old AR Docker images **and entire AR repositories** (not just
  CI-only GCS objects/buckets): [retirement gate](../docs/legacy-gcs-ar-retirement.md).
- [x] First WIF **read-only GCP** inventory:
  [run #37767798184](https://github.com/tommylin15/omniAgent/actions/runs/37767798184)
  confirms three AR formal-traffic services and two enabled old Cloud Build
  triggers; [run #37768217815](https://github.com/tommylin15/omniAgent/actions/runs/37768217815)
  confirms four AR packages and 9/5/4 AR revisions. GCS list returns
  NO_PERMISSION_OR_UNAVAILABLE; **no bucket deletion list is validated**.
  [Live checkpoint](../docs/cicd-transition-runtime-evidence.md).
- [ ] Obtain admin-scoped read-only GCS inventory, AR digest/consumer/Job
  dependencies and recovery evidence across regions; shared/unknown stays BLOCKED.
- [ ] After GHCR/Cloud Run cutover acceptance and old trigger retirement,
  capture one-time dry-run manifest, confirm owner authorization for exact
  assets and delete only demonstrably unreferenced **omniAgent-owned**
  legacy AR packages/repositories and CI-only GCS buckets/objects.
  Final GCP/runtime readback required; nothing deleted from this doc update.
- [ ] Evidence links and final acceptance; docs/source-only is not DONE.
  [New runbook](../docs/cicd-ghcr-actions-runbook.md) ·
  [acceptance](acceptance.md).

## Historical Cloud Build CI/CD V2 — retained evidence (2026-10-08)

- [x] Inventory Chat, bundled Flutter, Gateway, Shared; reuse private 2nd Gen
  repository and create separate us-central1 CI Push / manual Release triggers.
- [x] Source: tested SHA/change/image safeguards, independent Shared lock,
  bounded attempt/provider cost and recovery; manual V2 replaces old publishers.
- [x] Real CI Push PASS: `741b4e0c`, Cloud Build `2b4ea3e7-da60-48f0-857a-eb053b94253c`.
- [x] Explicit bounded shadow build/image/no-traffic Chat candidate executed:
  `400898cb-7bff-4a4f-8f94-08b89dc129e9`; full acceptance remains FAIL.
- [x] Shared existing three identities: real responses/fresh threads/cross-project
  denial PASS; no unrelated rebuild or consumer repository changes.
- [ ] Chat candidate /ready=503 remains unaccepted. Read-only live checks:
  private DSN structure PASS, private-range VPC PASS, hostssl HBA rule present;
  exact failure still unproven. Guarded candidate TLS source was committed and
  21/21 V2 safety checks PASS, but **no post-fix live deployment/probe yet**.
  Formal Chat traffic remains on the original revision at 100%.
- [x] Recovery tag/readback and cleanup missing-digest source guards fixed;
  GitHub Node Core `37737346341` and 19/19 CI/CD V2 safety tests PASS.
- [ ] Repeat live tagged recovery and cleanup dry-run; GitHub tests alone
  do not confirm the old Cloud Run failures are resolved.
- [x] Owner changed design to **single existing `omniagent-bundle`**
  (Provider + signing + Chat DB); implementation/merge helper committed.
  GitHub Node and Python source tests require exact-head verification.
- [ ] Administrator runs `infra/gcp/consolidate-omniagent-bundle.sh` from
  current GitHub main, adds a new version to the **existing** Secret and verifies
  restricted Secret-level Chat/Gateway/CI SA access. Do not create
  `omniagent-provider-bundle`; never disclose the generated signing key.
- [x] First unified-bundle Shadow Cloud Build
  `a6282825-fa74-4c4e-952e-b354e29a06b1`: nine pre-release
  build/deploy/probe steps PASS, Chat/Gateway 0% candidate deployed,
  Chat candidate `/health=200` and `/ready=200`; original Chat/Gateway/Shared
  **formal traffic unchanged**. Final release Gate FAIL, no promotion.
- [ ] Gateway/Recovery acceptance blocked on Chat service account
  ID token creation; CI `getAccessToken` was denied. Source converted
  to scoped IAM Credentials `generateIdToken` (3f8db1c9),
  Node Core 37758880725 PASS / 30 Python PASS. Administrator must grant
  `roles/iam.serviceAccountOpenIdTokenCreator` to omniagent-ci
  **only on** omniagent-chat SA; exact-head Shadow runtime rerun PENDING.
- [ ] Provider acceptance remains unproven (zero real provider calls);
  recovery full path still FAIL, browser OAuth and dispatcher OPEN.
  Old `omniagent-chat-db` and pinned `omniagent-bundle:2` remain for rollback.
- [ ] Human two-owner browser OAuth/dispatcher integration dependencies OPEN.
- [ ] All mandatory candidate gates, canonical release/readback/recovery.
- [ ] Safe image cleanup after dry-run and accepted release.
- [ ] Final evidence reconciliation; CLOSED only after every required gate.

See [operations](../docs/cicd-v2-runbook.md); CI success is not runtime acceptance.
Owner paused at the earlier checkpoint; subsequent instruction resumed
source hardening. Runtime promotion is still blocked pending live acceptance.
Latest observations: [evidence](../docs/cicd-v2-evidence.md#continued-cicd-v2-source-hardening--2026-10-08).

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
  - Deployment is authorized for omniAgent. GitHub→GCP preflight is now configured and passing; deployed visual acceptance remains open.

## P0 — real Phase 6B blockers

- [x] **Exact-head CI/test for the deploy candidate — PASS.**
  - Candidate SHA `7cc0ac3abda4a37720951569afd0214e91fd401c`; consolidated run `37640263980` PASS.
  - Node + Flutter gates passed on that SHA.
  - Immutable Chat image: `omniagent-chat@sha256:c5e812db8090490a6223fb317056859656190e343b1a3da499221b3e63aa3d23`.
  - Historical PostgreSQL image `omniagent-postgres@sha256:cd55d533a4cbed2d5bace1a0d3a1608a6719ffc6399970275ef9f8bd0e80f963` is superseded by the shared-instance decision and is no longer part of the active path.
  - The Chat image is in the approved omniAgent Artifact Registry and the build path does not recreate/use the default Cloud Build source-staging bucket.

- [x] **Create/verify independent dev Chat DB/role and apply 001/002 — PASS.**
  - Source-ready: reuse the approved shared PostgreSQL instance on port `5432`; create only `omniagent_chat` DB, `omniagent_chat_app` role, `omni_chat` schema, dedicated Secret `omniagent-chat-db`, bounded HBA/firewall, idempotent 001/002 bootstrap and read/write probe.
  - Capacity probe `37701385787` showed the host is `e2-micro` with about 966 MiB RAM, so the second-PostgreSQL-container design is explicitly abandoned.
  - Shared-instance probe `37701709678` confirmed the existing PostgreSQL endpoint and separate logical-database pattern. Compute/IAP access is now working after the operator grant.
  - Runtime run `37702554248` PASS: `omniagent_chat`, `omniagent_chat_app`, `omni_chat`, all 7 expected tables, 001/002, least-privilege role check, rollback-safe write probe, HBA reload and `omniagent-chat-db` Secret version 1 all verified.

- [ ] **Deploy Chat API + Flutter candidate without writer cutover.**
  - No-traffic workflow is prepared against the dedicated DB Secret and Direct VPC egress.
  - Candidate acceptance requires immutable image digest plus `/health=200`, DB-backed `/ready=200`, UI 200, protected API 401, and explicit `traffic_promoted=false`.

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
- [x] Execute/read back the omniAgent GCP bootstrap and require a new preflight PASS before marking GitHub→GCP deployment identity configured.
  - Repo-side bootstrap commit: `aabd96f879b84a984e54e9987ff28546fad99687`.
  - Project Hygiene `37633716460`: PASS.
  - GCP preflight `37633716553` attempt 1: FAIL at WIF token exchange with `invalid_target` before bootstrap.
  - GCP preflight `37633716553` attempt 2: PASS; tracked identifier validation, GitHub OIDC auth, `setup-gcloud`, and omniAgent resource readback all passed.

## Shared Codex runtime (2026-10-08 checkpoint)

- [x] **SOURCE + Node Core TEST PASS** — dedicated `services/shared-codex` reuses the omniAgent Codex App Server bridge and managed auth; bounded text-only `POST /v1/codex/execute`, Google-signed caller identity plus project-to-service-account match, per-request CODEX_HOME/thread/workspace, redacted failures. Node Core run `37706430070` PASS (source snapshot `203036be`).
- [x] **GCP WIF authentication + protected deployment preflight executed** — candidate workflow `37706571279`; source gate PASS, WIF PASS, preflight **BLOCKED_AUTH** because `SHARED_CODEX_AUTH_RESOURCE` repository variable was not populated. No new runtime deployment or live model response may be claimed.
- [ ] **Approved isolated Secret Manager auth** — prepare dedicated `omniagent-shared-codex-auth` auth material (or equivalent approved Secret) with valid current Codex auth, configure `SHARED_CODEX_AUTH_RESOURCE`; never migrate or delete an external system's Secret implicitly.
- [ ] **Allowlisted cross-application callers** — configure `SHARED_CODEX_CALLERS_JSON` with both confirmed caller service account identities and project labels, then grant service-level `roles/run.invoker`. A shared default compute service account is not sufficient evidence of project separation.
- [ ] **Dedicated Cloud Run deploy and real integration acceptance** — build/push image, verify dedicated runtime service account + private IAM/no-anonymous access, legitimate live Codex replies for each external consumer, forbidden cross-project request, credential refresh persistence, log redaction, timeout, account/quota diagnostics. Do not change existing Chat/Gateway routing or external callers before this gate.
- [ ] **Post-MVP** — durable idempotent request tracking/replay, rate/quota policy, observability, retries, approvals/tools/code execution scoped per caller, optional asynchronous workflow.

See [dedicated runtime integration runbook](../docs/shared-codex-runtime.md).

### Shared Codex live checkpoint — 2026-10-08

- **External application code is outside this work package**: do not modify any consumer repository. Consumer-side request/response adapter deployment is owned by separate agents after the shared endpoint is ready.
- **Deployment image PASS**: GitHub Actions `37708000610` built and pushed `omniagent-shared-codex:dcea992f20be424048941e86ad85f11515b4d65f`, digest `sha256:55212af1496c3b0f284779f9c3f6a752f2eda1c469b7c2deec08fa52cd0cecbd`; container Codex version `0.153.4`.
- **GCP deployment BLOCKED (IAM)**: `37707944086` source/build/GCP WIF PASS then `secretmanager.versions.get` denied for `omniagent-ci`; `37708023596` attempted standalone infrastructure bootstrap but `secretmanager.secrets.create` denied. No isolated Secret version or Cloud Run service deployment was evidenced by these runs.
- **Owner approved legacy Secret retirement without waiting for consumer cutover**: do not require another agent to finish first. Nonetheless preserve the legacy Secret until *this* service has copied auth under a dedicated Secret, completed verified Codex live inference, and passed security/isolation deployment readback. Do not silently delete based on a code commit or a build. No legacy Secret delete has occurred.
- **Required manual IAM bootstrap**: the GCP project administrator must provision the dedicated Secret, dedicated service accounts and necessary Secret access/version IAM; grant only read-only Secret metadata visibility to CI on its own resource, not project-wide Secret access. See `docs/shared-codex-runtime.md`.
- **Next exact gates**: approved auth transfer/readback -> Secret/SA IAM -> gated Cloud Run deploy -> signed invocation + live provider output -> legacy Secret retire -> consumer teams receive endpoint contract. Reporting must not claim downstream consumer integration before their own acceptance.

### Shared Codex IAM authorization — 2026-10-08

- Owner explicitly authorized adding the missing GCP permissions. Authorization does not itself confer `resourcemanager.projects.setIamPolicy`, `iam.serviceAccounts.setIamPolicy`, or `secretmanager.secrets.create` to the current GitHub WIF identity.
- The connected GCP management tool has IAM **role-definition** actions only, not IAM allow-policy binding or Secret Manager API writes. The available `omniagent-ci` WIF principal has live `PERMISSION_DENIED` for Secret metadata and create operations. No permissions were claimed to have been granted.
- Added `infra/gcp/bootstrap-shared-codex-iam.sh` as a scoped, idempotent, one-time administrator-run credential migration + IAM grant procedure; it does not modify or delete the existing external application's code or source credential Secret.
- GitHub Actions `37708912580` **PASS**: `bash -n`, ShellCheck and audit markers. Follow-up live GCP deployment/inference remains **BLOCKED_ADMIN_BOOTSTRAP**, not DONE.
- Once the authenticated GCP project administrator applies that script, rerun `.github/workflows/shared-codex-cloud-run.yml` and only advance based on authenticated Cloud Run real inference and isolation evidence. Legacy credential deletion remains a separate controlled step after verified success, without waiting on consumer app migration.

### Shared Codex dedicated Cloud Run — production verification 2026-10-08

- Shared service itself **LIVE ACCEPTED**: [GitHub Actions 37709954944 attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/37709954944) **SUCCESS** for source gate, approved dedicated Secret, private Cloud Run deployment, IAM/config readback, three real Codex responses and two cross-project denial cases. Accepted runtime image SHA `ff282575fb13163018827761b8bfee8e8789bcb3`.
- Private endpoint: `https://omniagent-shared-codex-2oo7qbkd5q-uc.a.run.app/v1/codex/execute` (Google ID token audience = base service URL). Verified project labels: `life-assistant`, `market-mart`, `omniagent`; each has a distinct approved service account.
- Independent [signed-caller diagnostic 37710625658](https://github.com/tommylin15/omniAgent/actions/runs/37710625658) also **SUCCESS**, proving Cloud Run IAM, signed-token claims and HTTP 200 live inference. Earlier HTTP 403 was observed immediately after IAM bindings; subsequent valid calls PASS, consistent with propagation delay. No provider outage asserted.
- **Remain OPEN**: External consumer app adapters not edited or validated; no claim that other projects have switched to this endpoint. Legacy credential Secret retirement requires the admin-run `infra/gcp/retire-legacy-codex-auth.sh`. User explicitly authorized independent legacy retirement after shared endpoint acceptance; do not wait for consumer code work, but do not record deletion before actual Secret Manager result.
- Security boundary: never print credentials; no public invoker; no shared user memory; bounded text-only sandbox. `docs/shared-codex-runtime.md` is the integration/runbook source of truth.

### Shared Codex independent service revalidation and retirement-status correction — 2026-10-08

- **Standalone shared Cloud Run: LIVE ACCEPTED**. Independent signed runtime repeat [GitHub Actions #37712312136](https://github.com/tommylin15/omniAgent/actions/runs/37712312136) **PASS** for enabled dedicated auth, private service revision, anonymous denial, three real Codex outputs, thread isolation and two cross-project 403s. Workflow's historical 'post-retirement' name does not establish that any Secret retirement occurred.
- **Legacy credential retirement: NOT EXECUTED per owner clarification**. The owner expressly stated no retirement Cloud Shell operation was performed; the prior assistant's interpretation of '跑好了' as script execution was incorrect. No `legacy_secret_retirement=PASS` evidence exists. The current CI identity cannot independently read this legacy Secret's metadata, so independently verified resource existence/deletion is UNCONFIRMED. Do not report this task as completed.
- **Consumer integration: OPEN**. Separate AI agents own the external consumer repositories. Neither external consumer's production adapter has been updated or accepted here; integration instructions are documented in `docs/shared-codex-consumer-handoff.md`.
- No external project code touched. Source-of-truth acceptance and evidence are in `docs/shared-codex-runtime.md`.
