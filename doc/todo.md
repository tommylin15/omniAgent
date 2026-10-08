# omniAgent TODO

## Actions + GHCR + Cloud Run migration — TARGET / OPEN (2026-10-08)

- [x] Formal owner design documented: Actions complete CI, three GHCR public
  digest images, Cloud Run 0% candidates, acceptance/traffic/rollback, optional
  read-only old Cloud Build status bridge. [SPEC §8](spec.md#8-cicd--github-actions--public-ghcr--cloud-run-2026-10-08).
- [x] Source: expand `.github/workflows/omniagent-ghcr-publish.yml` to
  ordinary `main` code changes; quality [Actions #37767763854](https://github.com/tommylin15/omniAgent/actions/runs/37767763854)
  PASS, publish intentionally BLOCKED by stale main SHA before any GHCR image.
- [ ] Observe exact-head main source quality and all three successful
  public-GHCR anonymous immutable digest receipts on a settled commit.
- [ ] Confirm three GHCR packages Public and anonymously retrievable by digest,
  record observed Actions run and Docker image digest receipts.
- [ ] Implement WIF-governed digest-pinned manual release, 0%-traffic
  Cloud Run candidates, readback and all real integration/security gates.
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
- [ ] Verify retirement of old Cloud Build triggers **after** replacement
  passes. Do not delete historical Artifact Registry/GCS assets or create VMs.
- [x] Record separate **legacy GCS and Artifact Registry retirement plan**,
  including old AR Docker images **and entire AR repositories** (not just
  CI-only GCS objects/buckets): [retirement gate](../docs/legacy-gcs-ar-retirement.md).
- [ ] Read-only inventory and classify all actual GCS buckets/objects, AR
  repositories/images/digests, consumers, Cloud Run service revisions/jobs/
  executions and recovery needs across regions; shared/unknown stays BLOCKED.
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
