# omniAgent TODO

### 2026-10-10 FR-013 BYOK metadata / lifecycle — code staged

- [x] Add owner-bound credential metadata schema migration 003.
- [x] Implement strictly scoped CredentialRegistry, provider/profile lifecycle
  PENDING/ACTIVE/REVOKING/REVOKED, fail-closed internal ref resolution.
- [x] Add Google Secret Manager v1 create, addVersion and disable adapter;
  provider secrets never persist in PostgreSQL, SSE events or public API.
- [x] Authenticated list/upload/revoke Chat endpoints behind an OFF-by-default
  CHAT_BYOK_MANAGEMENT_ENABLED flag.
- [x] Mocked lifecycle, HTTP and disposable PostgreSQL cross-owner regression.
- [ ] Exact-SHA CI, migration of approved runtime database, IAM scoping,
  reconciliation, BYOK rotation, Gateway inference wiring and real-owner
  authorized integration all remain OPEN.
- [ ] Do not change Cloud Run flags or invoke billable providers.
  See docs/credential-resolver.md for invariants.


### 2026-10-10 Read-only running-turn diagnostic

Implemented a service-authenticated, read-only GET at /internal/v1/chat/reconciliation:candidates. Returns up to 50 RUNNING identifiers from explicitly authorized owners if the queue creation timestamp is at least 10 minutes old. No model calls, requeueing, approval changes, prompts or secrets. Queue creation age does not prove claim duration. Source/CI/runtime acceptance are tracked separately.


### 2026-10-10 Owner-model authorization / SSE integrity development

- [x] Exact Owner UUID + Provider runtime + Model platform entitlement
  parser; rejects unknown owner, arbitrary BYOK locator or paid OpenRouter.
- [x] Authenticate and check stored thread at message admission; restrict
  PostgreSQL SKIP LOCKED worker claims with same model-policy tuples.
- [x] Enforce real OpenRouter SSE [DONE] before completed, bounded event
  count/bytes and UTF-8-safe, redacted failure behavior.
- [ ] Exact-source CI, disposable PostgreSQL acceptance and 0% candidate
  signed smoke must pass before marking CODE/CI PASS.
- [ ] Owner BYOK lifecycle, real model inference, approval/cancel/reconnect,
  unified live acceptance, rollback and production release still OPEN.
- Dispatch enablement/entitlements not changed in Cloud Run.


### 2026-10-10 Groq bounded adapter — SOURCE ONLY (NOT WIRED)

- Source: `services/agent-gateway/groq_provider.ts`; contract fixtures:
  `tests/groq_provider.test.ts`. Based on the official Groq Chat Completions
  API and its current HTTPS endpoint. Text-only output; no tools/remote MCP.
- Requires an explicit `GROQ_EXECUTION_ENABLED=true` in addition to a
  valid `GROQ_API_KEY` before making any external request; validates model,
  message bounds and returned text, caps completion tokens, redacts
  provider failure bodies. Unit fixtures never use real credentials.
- **NOT CONNECTED** to Gateway request routing, Chat runtime or Flutter
  model selection; the UI continues to show Groq as preview only.
  No Groq Secret is created, execution flag enabled or paid inference made.
  Owner entitlement/BYOK and actual live acceptance remain OPEN.

### 2026-10-10 Flutter stale-replay isolation — staged source

The Chat UI now gives each thread selection a generation identifier.
A replay request that belongs to an older/deleted thread cannot replace
the new thread's connection state or schedule a stale polling timer.
Switching threads can start the new replay immediately even when the old
request has not finished; pressing "new conversation" or deleting the
selected thread cancels the old timer, clears selection state, and
invalidates pending responses. Widget regression exercises overlapping
requests with an old-thread network failure followed by the new thread's
cursor update. Existing two-second polling remains; this change does
**not** claim completed streaming/reconnect acceptance.

**STAGED-CODE** until the exact SHA's Flutter CI completes, then the
later unified live browser/mobile acceptance. No formal release.

### 2026-10-10 Chat durable response commit — staged source

- Implement `appendGatewayEvents` with owner/thread/turn row checks, a
  single transaction for all validated Gateway events and final status,
  no partial SSE response and explicit uncertain-commit reconciliation.
- Add disposable PostgreSQL failure injection on second event,
  atomic rollback, replay ordering, duplicate/cross-owner and secret safety.
- **STAGED-CODE / CI PENDING**; this is not a real provider or live
  owner-level acceptance. No enablement of model execution or final
  production release.

## 2026-10-10 集中開發批次 — 最後統一驗收

本輪只新增不需付費推論或 Owner 私密憑證的部署安全實作：
候選與 Smoke 共用 concurrency；固定 Preview 來源 SHA/digest/Revision、
正式流量、既有設定及非 Preview 標籤驗證；固定網址 HTTP 驗證；
更新失敗時的受保護回復；成功/失敗/回復證據；單元測試；
禁止 Revision tag 清理誤刪固定 `preview`。
`OMNIAGENT_AUTO_PREVIEW_ENABLED` 預設未啟用，需另行驗收及核准。
此次 **STAGED-CODE** 不等於 CI PASS 或完成上線；後續一次統一跑
exact-SHA CI → 0% candidate → fixed-preview/UI OAuth → 授權 Owner 真實推論
與 DB SSE replay（需使用者解除暫停）→ GHCR-only 正式回滾 →
正式發布及最後 10 Revisions 的清理。Codex owner 權限維持暫停，
不可自行開啟付費推論。

## 2026-10-09 正式流量已切換；產品驗收仍未完成

依使用者明確授權，GHCR release `1a8e575bb9f6224e698765d268c6e823e94ba55a` 已固定為三服務 100% 正式流量：Chat `00039-rik`、Gateway `00030-coy`、Shared `00019-puf`，live readback 均 Ready=True。正式 Chat health/ready/UI 資產 200，匿名 API 401。Gateway 一個指向 DESTROYED Secret 的失效歷史標籤已移除以完成路由更新；未刪 revision、Secret 或資料。

[完整發布證據與前後快照](../docs/production-promotion-2026-10-09.md)。這次是使用者授權的流量切換，未完成既有全部 release gates；真實 Chat provider dispatch、持久化 SSE replay、owner Codex mapping、approval/cancel/reconnect 與正式 rollback 演練仍 OPEN。舊紀錄中的「正式流量未變更」僅適用其各自歷史 checkpoint。不得因此啟用 retention 或舊資源清理。


## 2026-10-09 固定 preview 發布規則：文件回寫／實作缺口

規則與狀態：[GHCR runbook 固定 preview](../docs/cicd-ghcr-actions-runbook.md#固定-preview-網址與每次發布規則2026-10-09)。
本次只更新文件；本機未提交 preview workflow/helper 草稿未視為部署完成。

- [ ] 完成並驗證 preview 草稿的 CI／真實候選發布與正式流量、設定、其他標籤保護。
- [ ] 更新後失敗恢復上一個已驗證 preview；驗證恢復成功與恢復失敗回報。
- [ ] 補齊固定網址 health/ready、UI 資產與未授權拒絕驗證。
- [ ] 候選部署與 preview 更新共用併發防護；阻止檢查後的 stale SHA／revision 競態。
- [ ] 每次保存完整 SHA、revision、digest、固定網址、驗證與恢復結果，包括失敗紀錄。
- [ ] 由操作者確認固定來源 OAuth 設定及真人登入；不因 revision 更換重設 OAuth。

preview 通過不授權正式發布；既有正式 acceptance／recovery gates 持續適用。


**2026-10-09 model selection implementation:** Searchable editable model suggestions
now cover Codex sol/luna/astra/terra, Gemini text models, OpenRouter free models,
and Groq preview only. Gemini dispatch uses the thread model; OpenRouter IDs
accept vendor/model syntax without relaxing thread or non-OpenRouter validation.
Provider access remains subject to account entitlement and existing paid-tier gates.
Browser-authorized owner UUID was obtained from the app's thread response; this
does not enable owner dispatch. Codex Secret resource mapping and a bounded live
provider test remain required. CI, candidate deploy and runtime evidence for this
change completed successfully:
[GHCR quality and publication #37932371785](https://github.com/tommylin15/omniAgent/actions/runs/37932371785),
[zero-traffic deployment #37932955708](https://github.com/tommylin15/omniAgent/actions/runs/37932955708),
and [current candidate auto smoke #37933132998](https://github.com/tommylin15/omniAgent/actions/runs/37933132998).
Release `1a8e575bb9f6224e698765d268c6e823e94ba55a`, Chat `00039-rik`.
Deployed `main.dart.js` returned HTTP 200 and included all 42 catalog model IDs.
Local Node build and 56 tests PASS (database acceptance skipped locally, run in CI);
Flutter analyze, 12 widget tests and release Web build PASS. Automatic smoke
verified current immutable GHCR revisions, zero traffic, Chat readiness/web,
unauthorized API denial and signed private service health. Provider inference and
owner-scoped PostgreSQL replay remain NOT VERIFIED; formal traffic is unchanged.
The project Codex CLI default is committed as `gpt-6-luna` with `low` reasoning.

## Current delivery scope — NEW GitHub Actions → GHCR → Cloud Run only (2026-10-09)
**2026-10-09 dispatch prerequisites revalidation — READ-ONLY PASS; LIVE DISPATCH BLOCKED:**
[Fresh configuration preflight #37928424345](https://github.com/tommylin15/omniAgent/actions/runs/37928424345)
PASS on `main@a216aa40f35d8a8187fec0a23f9ea132dade784f`.
Current Chat `00038-yog` and Gateway `00029-ter` remain Ready with valid
candidate routing. Dispatch remains DISABLED; approved owner count is 0;
Gateway candidate URL and audience do not match Chat configuration;
Gateway `CODEX_OWNER_SECRETS` is missing from the runtime environment.
Next required inputs: an explicitly approved real owner UUID, provider/model
and bounded test allowance; Codex also requires that owner's established
Secret resource mapping. No owner IDs or credentials were inferred from
browser OAuth PASS or the provider bundle. Positive live HMAC, provider
execution and persisted PostgreSQL replay remain NOT VERIFIED.
No Secret payload access, PostgreSQL writes, provider calls or formal
traffic changes were performed by this preflight. This checkpoint records
prerequisites only; it does not authorize enabling dispatch or release.

**2026-10-09 earlier new-GHCR-only live readback (superseded candidate):**
[Current primary/fallback #37925707793](https://github.com/tommylin15/omniAgent/actions/runs/37925707793)
PASS for new `f9a4a7b5d4d226d47af6aa526d49d10737b44406`
and previous `f2a5be4425953b26f2340694765362c7bdc943c9`,
with no legacy rollback or formal traffic mutation.
[Latest-ten inventory #37925707749](https://github.com/tommylin15/omniAgent/actions/runs/37925707749)
PASS read-only: Chat 27 (17 excess, 13 tagged outside ten),
Gateway 23 (13 excess, 11 tagged outside ten),
Shared 18 (8 excess, 4 tagged outside ten).
**68 existing, 38 excess and 28 outside-ten tagged Revision
references**. Cleanup must remain blocked until separately authorized
promotion/real GHCR rollback and obsolete tag dependency audit;
**zero Revisions or tags removed** in these workflows.

**2026-10-09 current Chat→Gateway signed integration status — LOCAL PASS; LIVE CODEX BLOCKED:**
The non-billable local HTTP integration test (commit
`f9a4a7b5d4d226d47af6aa526d49d10737b44406`) exercises
Chat's real signature generator against Gateway's real HTTP
`signedBody` middleware, then a synthetic provider fixture,
owner-scoped event persistence calls, and invalid-HMAC rejection.
[Full CI/GHCR #37924500076](https://github.com/tommylin15/omniAgent/actions/runs/37924500076)
PASS; [Cloud Run 0% deploy #37924894616](https://github.com/tommylin15/omniAgent/actions/runs/37924894616)
PASS; [current signed smoke #37925039627](https://github.com/tommylin15/omniAgent/actions/runs/37925039627)
PASS. Candidate Revisions: Chat `00038-yog`, Gateway `00029-ter`,
Shared `00018-poq`. Prior approved GHCR fallback Chat `00037-duj`,
Gateway `00028-rof`, Shared `00017-lob`. No formal traffic moved.

[Newest actual GCP configuration inspection #37925330111](https://github.com/tommylin15/omniAgent/actions/runs/37925330111)
PASS read-only, but application gate remains **OPEN**:
Chat dispatch DISABLED, **zero** approved owner IDs, Chat Gateway
URL/Audience mismatched or missing, Gateway Bundle configured but
`CODEX_OWNER_SECRETS` not explicitly supplied via Cloud Run env.
Gateway `loadAgentBundle` currently maps provider keys/HMAC but
**not** `CODEX_OWNER_SECRETS`, so owner-bound Codex credentials cannot
be inferred from the bundle. Positive live HMAC, actual owner-specific
Codex auth, real provider inference → PostgreSQL SSE replay all
**NOT VERIFIED**. User's A→B→A Google account isolation remains
**OPERATOR-REPORTED MANUAL PASS**. No synthetic Owner entitlements,
Secret payload reads, DB writes, paid Provider calls or production
traffic changes were performed in the read-only inspection.

**2026-10-09 two-account Google browser OAuth — OPERATOR-REPORTED PASS:**
User completed the 0%-traffic GHCR Chat candidate A → B → A browser
sequence and expressly confirmed **both** essential isolation assertions:
(1) after signing in as B, A's thread was not visible; and
(2) returning to A restored A's earlier thread.
Scope: human-observed login, account-switch UI isolation and A-thread
visibility/persistence across sign-out; no passwords, OAuth tokens,
account identifiers or owner UUIDs were supplied or stored.
Evidence class: **OPERATOR-REPORTED MANUAL PASS**; not a replayable
backend database query, a second independently observed human session,
or proof of billable Provider dispatch. Candidate:
`https://ghcr-f2a5be442595---omniagent-chat-2oo7qbkd5q-uc.a.run.app`.
Next gates: verify approved Owner entitlement/real Chat→Gateway signed
model dispatch → PostgreSQL event replay, and separate authorized
GHCR-only production cutover/rollback. Do not turn on model execution
or change production traffic based on UI OAuth PASS alone.

**2026-10-09 real IAM/HMAC negative boundary — PASS (historical; browser manual OAuth now PASS):**
The accepted exact GHCR candidate `f2a5be4425953b26f2340694765362c7bdc943c9`
was tested in [live Chat↔Gateway security #37917980938](https://github.com/tommylin15/omniAgent/actions/runs/37917980938):
anonymous Chat/Gateway denials PASS, Chat service identity can invoke
private Gateway PASS, and POSTs with missing, invalid or expired HMAC
all return HTTP 400 before model execution. Formal serving 100% routing
unchanged; no DB mutation, Secret payload retrieval, or provider charges.
**This is a negative security test, NOT proof of accepted HMAC or actual
Provider calls**. The current 0%-traffic Chat browser candidate:
`https://ghcr-f2a5be442595---omniagent-chat-2oo7qbkd5q-uc.a.run.app`.
One human operator should test Google account A → create a test thread,
sign out → account B → confirm no A thread, sign out → A →
confirm only A's thread reappears. No email, password, cookies, ID
tokens or user identifiers should be pasted into public logs or ChatGPT.
If OAuth rejects the unique tagged hostname, this is **BLOCKED for
candidate browser validation**, not evidence that the two-owner gate
passed. Actual authorized provider dispatch remains disabled and requires
separately approved Owner entitlements and a bounded paid-call policy.
**That human login action was subsequently completed and confirmed; see operator-reported PASS above.**

**2026-10-09 latest retention implementation and GCP evidence — PARTIAL:**
New post-promotion-only tag retirement implementation:
`scripts/cloudrun_revision_tag_retirement.py`,
`tests/test_cloudrun_revision_tag_retirement.py`,
and release-only `.github/workflows/omniagent-cloudrun-retain-ten.yml`
(commit `f2a5be4425953b26f2340694765362c7bdc943c9`).
The workflow cannot be dispatched independently: it requires
`workflow_call` approval inputs for **application acceptance and
formal GHCR traffic promotion** plus **retired tag URL dependency audit**.
Its stage order is strict tag-retirement dry-run → selected obsolete
outside-ten tag removal with fresh traffic/tag readback → latest-ten
Revision dry-run → guarded deletion. No old Artifact Registry rollback
target; the new GHCR fallback pair is protected.
**Implementation/tests PASS**, verified by
[full CI + 3 GHCR #37915501123](https://github.com/tommylin15/omniAgent/actions/runs/37915501123);
[Cloud Run 0% candidates #37915797147](https://github.com/tommylin15/omniAgent/actions/runs/37915797147)
and [auto signed smoke #37915994575](https://github.com/tommylin15/omniAgent/actions/runs/37915994575)
also PASS. Candidate Revisions Chat `omniagent-chat-00037-duj`,
Gateway `omniagent-agent-gateway-00028-rof`,
Shared `omniagent-shared-codex-00017-lob`.
Prior accepted GHCR fallback Revisions Chat `00036-pev`,
Gateway `00027-suw`, Shared `00016-jaz`.
Current/fallback pair verified by
[GHCR-only read-only rollback #37916199053](https://github.com/tommylin15/omniAgent/actions/runs/37916199053)
PASS; new Shared real three-caller provider inference
[#37916199074](https://github.com/tommylin15/omniAgent/actions/runs/37916199074)
PASS with cross-project denial.
**Newest GCP retention inventory**
[#37916199040](https://github.com/tommylin15/omniAgent/actions/runs/37916199040)
PASS read-only: Chat 26 Revisions (16 excess; 12 beyond-ten tags),
Gateway 22 (12 excess; 10 beyond-ten tags), Shared 17
(7 excess; 3 beyond-ten tags): total **65 Revisions, 35 excess,
25 tag references beyond ten**. All three current old serving
100% Revisions remain outside latest ten; no deletion eligible yet.
Actual tag removal, traffic cutover, GHCR→GHCR rollback drill and
Revision deletion all **NOT VERIFIED / NOT PERFORMED**.
Human two-owner OAuth and authorized Chat→Gateway provider dispatch
remain OPEN; do not enable model charges or invent owner entitlements.

**2026-10-09 newest GCP live retention inventory — READ-ONLY PASS, cleanup BLOCKED:**
[Three-service GCP inventory #37914559743](https://github.com/tommylin15/omniAgent/actions/runs/37914559743)
and [precise last-ten tag analysis #37914953148](https://github.com/tommylin15/omniAgent/actions/runs/37914953148)
both SUCCESS with **zero mutations**.
Chat currently 25 Revisions (15 over limit), Gateway 21 (11 over),
Shared 16 (6 over): **62 existing / 32 above ten** in total.
Of 45 historical/other 0% tagged entries outside the approved
GHCR primary/fallback pair, **22 tagged Revision references are
outside latest ten** (Chat 11, Gateway 9, Shared 2), requiring
reviewed post-promotion tag retirement before safe deletion.
All three current formal 100%-serving old Revision names are
**outside the latest ten**, so last-ten deletion cannot occur now.
The new digest-pinned GHCR primary `6ab64229738bb75490231aed93e0d0d759c3aa4b`
and previous accepted GHCR fallback `c6020ed87fcf4b696f5816e23a34ba7b18350ebb`
are **both inside** newest ten for all services. Do NOT treat the old
currently serving Revision as a required new-pipeline rollback target,
but do not delete it while it still serves traffic.
After actual human OAuth/two-owner/Chat→Gateway application acceptance
and authorized new GHCR 100% traffic promotion + actual GHCR-only rollback
rehearsal, remove obsolete outside-ten tag routes only after dependency
review, independently re-read service allocation (must stay 100% GHCR
primary), then run the gated latest-ten retention deletion. No
old Cloud Build/AR rollback gate. As of these two runs: **32 deleted = 0**.

**2026-10-09 latest Chat integration hardening and live candidate — PARTIAL:**
source `6ab64229738bb75490231aed93e0d0d759c3aa4b` enforces owner-ID
binding on all Gateway reply events before database persistence, including
Codex native thread/turn IDs; targeted regression test is included in
[full CI / public GHCR #37903996197](https://github.com/tommylin15/omniAgent/actions/runs/37903996197)
**PASS**. Automatically triggered
[three 0%-traffic revisions #37904503766](https://github.com/tommylin15/omniAgent/actions/runs/37904503766)
and [current signed Smoke #37904670566](https://github.com/tommylin15/omniAgent/actions/runs/37904670566)
**PASS** (Chat `omniagent-chat-00036-pev`; Gateway
`omniagent-agent-gateway-00027-suw`; Shared
`omniagent-shared-codex-00016-jaz`). Previous GHCR-only primary
`c6020ed87fcf4b696f5816e23a34ba7b18350ebb` is the verified
fallback (Chat `00035-ker`, Gateway `00026-xum`, Shared `00015-gew`).
[GHCR-only six-Revision read-only fallback #37904836739](https://github.com/tommylin15/omniAgent/actions/runs/37904836739)
**PASS**, all six Ready, digest/tag-matched and Secret refs ENABLED.
[Current Shared 3-caller real provider acceptance #37904946565](https://github.com/tommylin15/omniAgent/actions/runs/37904946565)
**PASS** including cross-project denials and separate provider threads.

**Verified actual Chat candidate settings**, from the
[read-only authenticated GCP preflight #37903833063](https://github.com/tommylin15/omniAgent/actions/runs/37903833063):
Google OAuth client and internal service auth configuration PRESENT,
but `CHAT_DISPATCH_ENABLED` **DISABLED**, zero approved dispatch
Owner UUIDs, and no Chat Gateway candidate URL/audience match.
The preflight read **no Secret payload**, wrote **no Chat DB records**,
and did **not** change traffic. Enabling live billable provider dispatch
requires approved actual Owner IDs and validated candidate Gateway
route/audience; no fake owner or implicit auto-enable.
Real browser two-human-account OAuth/session isolation, real
Chat→Gateway provider persistence/replay/cancel/approval and actual
GHCR ↔ GHCR traffic rollback / production cutover remain OPEN.

**2026-10-09 earlier owner-approved NEW-only rollback checkpoint — release preparation PARTIAL:**
The historical Cloud Build / Artifact Registry rollback path is explicitly
**not** a prerequisite. Earlier all-GHCR primary
`c6020ed87fcf4b696f5816e23a34ba7b18350ebb` passed
[CI/GHCR #37896498492](https://github.com/tommylin15/omniAgent/actions/runs/37896498492)
→ [3 real 0%-traffic candidates #37896743989](https://github.com/tommylin15/omniAgent/actions/runs/37896743989)
→ [automatic signed Smoke #37896904915](https://github.com/tommylin15/omniAgent/actions/runs/37896904915).
Proposed GHCR-only rollback `c7f32b23d4ac4b60d43b3108e69e5b4019e31321` and new primary
passed the [read-only two-release fallback test #37897007278](https://github.com/tommylin15/omniAgent/actions/runs/37897007278):
6/6 Ready, immutable digests, matching tags and ENABLED Secret references,
formal traffic unmodified. Chat `00035-ker` ↔ `00034-vul`,
Gateway `00026-xum` ↔ `00025-jom`,
Shared `00015-gew` ↔ `00014-lij`.
Earlier GHCR fallback `e3475d3...` **BLOCKED** by
[preflight #37896367974](https://github.com/tommylin15/omniAgent/actions/runs/37896367974)
because its Gateway Secret version `2` is DESTROYED.
Current primary Shared three-caller **real Codex** inference PASS:
[#37897135903](https://github.com/tommylin15/omniAgent/actions/runs/37897135903),
including isolated threads and cross-project denial. The earlier fallback
Shared also passed real inference:
[#37896120562](https://github.com/tommylin15/omniAgent/actions/runs/37896120562).
**GHCR-only rollback TARGET READINESS PASS; real traffic rollback rehearsal,
human two-owner browser OAuth, Chat↔Gateway end-to-end provider dispatch,
formal traffic promotion and retention NOT VERIFIED.** No formal cutover,
actual traffic rollback or Revision deletion was performed.

**2026-10-09 earlier automatic chain accepted checkpoint — PASS (gate #1):**
source commit `c7f32b23d4ac4b60d43b3108e69e5b4019e31321`;
[full quality and three public GHCR digests #37894051418](https://github.com/tommylin15/omniAgent/actions/runs/37894051418)
SUCCESS → automatically triggered
[three 0%-traffic Cloud Run candidates #37894312427](https://github.com/tommylin15/omniAgent/actions/runs/37894312427)
SUCCESS → automatically triggered
[signed and anonymous live candidate Smoke #37894440766](https://github.com/tommylin15/omniAgent/actions/runs/37894440766)
SUCCESS. New revisions Chat `omniagent-chat-00034-vul`,
Gateway `omniagent-agent-gateway-00025-jom`, Shared
`omniagent-shared-codex-00014-lij`. All three Ready, correct
immutable GHCR digests, candidate 0%, formal traffic preserved;
Chat health/ready/Web 200, protected routes 401, private anonymous
403, signed Gateway/Shared health (and Shared ready) 200.
Gateway gcloud CLI returned nonzero because an *old* tagged failed
revision `omniagent-agent-gateway-00021-boq` still points to
DESTROYED Secret version 2; independently verified **new** Gateway
revision `00025-jom` Ready with the enabled `omniagent-bundle:latest`.
The workflow records the nonzero CLI exit and accepts it **only** after
strict new-revision/digest/tag/runtime-config/traffic readback.
This anomaly remains tracked separately; it is not a production
acceptance or reason to delete historical revisions.
**Gate #1 PASS; production application integration, cutover/rollback
(gate #2), and ten-revision retention (gate #3) remain OPEN.**

The operator explicitly excludes investigation/cleanup of legacy CI/CD
Cloud Run revisions, historical Docker images, Cloud Build and GCS assets
from the active completion path. Manual asset cleanup was reported by the
operator; do not turn it into a prerequisite or treat unverified cleanup
as a newly audited PASS. Preserve non-omniAgent data and backup safety.

- [x] Earlier source-quality and three immutable public GHCR image publications
  for code SHA `e3475d3aade0fd8061d832d2dd4a0af45a8892ac`:
  [GHCR Actions #37867383817](https://github.com/tommylin15/omniAgent/actions/runs/37867383817).
  Flutter auth-account switch State isolation with widget regression test:
  [Flutter #37867383811](https://github.com/tommylin15/omniAgent/actions/runs/37867383811).
- [x] Earlier 0%-traffic candidates: Chat `omniagent-chat-00029-nux`,
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
  **At that historical checkpoint** successful deployment → automatic smoke
  was NOT VERIFIED; the newer accepted `c7f32b2` run above proves PASS.
- [x] **2026-10-09 historical GHCR Secret deployment blocker — mitigated by verified current-path candidate:**
  all three newly published GHCR digests were anonymously accessible in
  candidate #37877047775. Chat `omniagent-chat-00030-puq` deployed at 0%
  with serving traffic preserved. Gateway candidate failed because existing
  Cloud Run configuration still references Secret Manager
  `omniagent-bundle` version `2`, which Cloud Run reported `DESTROYED`
  for two environment secret references. Shared was not attempted.
  All three formal serving revisions read back at 100% **before** deployment;
  a post-failure three-service readback has not been obtained.
  Historical safe-block rule: do not guess replacement Secret payloads.
  The later verified 0%-traffic Gateway candidates use the already ENABLED
  `omniagent-bundle:latest`, without changing the original serving revision.
  Real payload/contract compatibility remains an application integration gate.
  **Historical run result: BLOCKED; newer exact-SHA gate #1 E2E PASS above.**
- [x] **2026-10-09 no-partial-deploy safeguard:** commit
  `e6ef98a7548b40d9807f5ce22e70a6b2795b8e75` passed full quality,
  Node Core and three GHCR publishes
  [#37877688902](https://github.com/tommylin15/omniAgent/actions/runs/37877688902).
  Candidate [#37877905596](https://github.com/tommylin15/omniAgent/actions/runs/37877905596)
  confirmed all three public image digests, WIF and each service's 100%
  existing formal traffic, then failed closed on missing Secret-version
  metadata readback **BEFORE ANY deployment command**. Actual deploy step
  SKIPPED; downstream auto-smoke
  [#37877968631](https://github.com/tommylin15/omniAgent/actions/runs/37877968631)
  SKIPPED as designed. Read-only GCP diagnostic
  [#37877547277](https://github.com/tommylin15/omniAgent/actions/runs/37877547277)
  confirmed Chat `omniagent-bundle:latest`, Gateway `:2` and `:latest`,
  Shared no environment Secret reference, with metadata unreadable to CI.
  Earlier Cloud Run deploy **explicitly** reported Gateway version `2`
  DESTROYED. **Safety regression PASS in that run; recovered candidate
  deployment PASS in the newer observed full automatic chain above.**
- [x] **Admin-scoped Secret version metadata recovery:** `omniagent-ci`
  has Secret-scoped `roles/secretmanager.viewer` for `omniagent-bundle`,
  without payload-read permission; actual CI diagnostics proved version
  `latest` ENABLED and version `2` DESTROYED. The approved single-bundle
  Gateway candidate was successfully created at 0% and signed smoke PASS.
  This does **not** prove every provider/HMAC application scenario:
  real provider, dispatcher and multi-owner contract acceptance is still OPEN.
  No separate production Secret rotation or traffic promotion was done.
- [ ] **Mandatory live integration**: two *real* browser Google OAuth accounts,
  persistent owner separation and account-switch UI; approved owner/provider
  entitlement, real Chat→Gateway signed dispatch, persisted provider event
  replay and cancel/approval/reconnection/recovery evidence. Mocked and
  PostgreSQL acceptance tests alone cannot satisfy this item. The current
  Chat dispatcher is deliberately opt-in and remains disabled in candidates.
- [x] **Mandatory Shared current-candidate real inference (scope PASS):**
  all three approved caller identities returned real provider outputs with
  new threads and cross-project denials on GHCR
  `c6020ed87fcf4b696f5816e23a34ba7b18350ebb`, run
  [#37897135903](https://github.com/tommylin15/omniAgent/actions/runs/37897135903).
  This does **not** establish browser OAuth or full Chat↔Gateway integration.
- [ ] **Release gate**: only after both live integration items pass, perform
  bounded 3-service production traffic promotion with readback, an actual
  rollback rehearsal **between two validated GHCR release sets only**, and
  recovery, then separately invoke revision retention for the *approved
  new delivery path*. No older Cloud Build/AR rollback dependency. Do not let source tests or 0%
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
