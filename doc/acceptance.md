## 2026-10-13 — market-mart full CEO Prompt Gateway capacity: candidate LIVE PASS, consumer integration still separate

- **Root cause fixed:** original `/v1/gemini/execute` rejected request-body payloads over 12,000 B and UTF-8 prompts over 8,192 B, below the market-mart complete CEO sample of **29,987 UTF-8 bytes**. Source now accepts **32,768 B decoded UTF-8 Prompt for `market-mart` only**, preserves **8,192 B** for `life-assistant` and `omniagent`, and permits **131,072 B JSON envelope** for Python `ensure_ascii=True` CJK escapes. Upstream Gemini Provider still enforces max 32,768 UTF-16 characters, so there is no uncapped alternate path.
- **Immutable code/build/deploy evidence:** SHA `965b05542a35631feb1e663e1a2a58cf1bd92198` passed [Node Core #38388184457](https://github.com/tommylin15/omniAgent/actions/runs/38388184457), [GHCR all-image publish #38388184822](https://github.com/tommylin15/omniAgent/actions/runs/38388184822), [0% candidate #38388704601](https://github.com/tommylin15/omniAgent/actions/runs/38388704601), and [signed smoke #38388876984](https://github.com/tommylin15/omniAgent/actions/runs/38388876984).
- **Live, bounded original Gateway route acceptance:** [market-mart 32 KiB live candidate #38389324047](https://github.com/tommylin15/omniAgent/actions/runs/38389324047) **PASS**; [hygiene-corrected repeat #38389373782](https://github.com/tommylin15/omniAgent/actions/runs/38389373782) also **PASS**. Dedicated `market-mart` SA IAM/Google ID-token authenticated against zero-traffic candidate `https://ghcr-965b05542a35---omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app`; canonical ID-token audience is `https://omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app`. Each live job performed exactly **one** real Gemini Flash-Lite `generateContent` call with a synthetic **29,987 B UTF-8 CJK Prompt**, serialized using Python-default JSON into **60,150 B on wire**, and received 200/COMPLETED with a nonempty model reply and matching request ID. Across the two successful smoke workflow runs, there were **two bounded real provider calls total**; no cost estimate is inferred.
- **Negative and safety results (both runs):** market-mart 32 KiB+1-byte Prompt and Life 8 KiB+1-byte Prompt returned HTTP 400 `invalid_request` before inference; private Gateway service account IAM, distinct project binding and Flash-Lite entitlement were checked. Formal Gateway traffic remained unchanged across the smoke workflow, and tagged candidate remained at **0%**. No consumer repo, key, DB, schema, Chat UI or Life feature changed.
- [x] **omniAgent Gateway input-capacity blocker for the 29,987 B market-mart CEO request is resolved on the verified candidate URL.**
- [ ] **Separate remaining consumer acceptance:** run the *original complete* market-mart CEO Prompt from its existing backend using its dedicated identity and the 0%-traffic candidate URL, then verify the caller's requestId/model/result contract, complete CEO JSON schema, and existing database write/validation constraints. A synthetic 29,987 B input SUCCESS does **not** prove model-quality, five-Specialist logic or valid CEO JSON. The response remains capped at **512 generated tokens**, which could independently truncate a complex CEO JSON output. Do not auto-expand output or billable inference/retries without separate evidence and approval.
- [ ] **Formal rollout:** do not infer production Gateway adoption from a 0%-candidate tag or no-op formal release workflow. Gateway serving traffic/image/config and each consumer's authorized release must be independently verified before claiming final public deployment.

## 2026-10-13 — Life P0-V technical integration handoff (consumer-reported DONE)

- **Life Assistant project report:** P0-V technical connection is **DONE on the Life side**. The agreed scope is the existing Life backend/service identity → private omniAgent Gateway → Gemini Flash-Lite → validated response returned to the existing Life application workflow. This is **not** a requirement to add a user-facing chat page, conversation UI, or any new unplanned Life product feature.
- **Evidence separation:** this handoff status is **reported by the Life project via the Owner**, not a new independent verification of Life's repository, CI, runtime logs, or application data from within the omniAgent project. omniAgent previously verified the dedicated Life service identity via its bounded Gateway Gemini pilot ([#38357794169](https://github.com/tommylin15/omniAgent/actions/runs/38357794169)); that CI impersonation alone does not prove the separate Life runtime. Do not mislabel this project report as a fresh omniAgent G3 runtime readback.
- **Acceptance boundary:** preserve all existing user consent, data authorization, context restrictions and backend validation/write rules. No new UI requirement, no artificial OAuth manual acceptance, no broad production traffic promotion, no extra provider calls and no changes to the Life repository as part of this handoff.
- **Next:** record Life-side technical completion as `REPORTED_DONE`, keep independent omniAgent-side consumer-runtime provenance `NOT_INDEPENDENTLY_VERIFIED_HERE`, and continue tracking market-mart separately. P0-V engineering technical completion is not identical to formal multi-consumer public launch.

## 2026-10-13 — P0-V omniAgent Owner Chat minimum vertical roundtrip ACCEPTED (Preview only)

- [x] **Actual approved Owner UI observation:** successfully created an omniAgent Chat conversation, sent the one-message Gemini Flash-Lite test, received the expected textual response, refreshed the browser, reselected the existing history thread and **confirmed the same assistant reply remains visible**. The browser/refresh is **Owner-reported acceptance evidence**; it is not a CI-simulated OAuth/user browser session.
- [x] **Independent bounded PostgreSQL evidence:** [Owner durable turn readback #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212) queried the *same approved OAuth-backed Owner* and `gemini-3.5-flash-lite` after the Preview deployment: 3 threads, 1 turn, 1 COMPLETED, 1 nonblank persisted `text_delta`, 1 `turn_completed`, **1 durable completed turn**. DB SQL used READ ONLY + ROLLBACK; no prompt, response, user IDs, Secret or OAuth token was logged. Counts corroborate the observed single successful roundtrip, but a strict per-request trace-ID join was not obtained.
- [x] **Technical acceptance boundary:** the scoped `Chat UI → Chat API/Owner authorization → signed private Gateway → Gemini Flash-Lite → omniAgent PostgreSQL → reloaded Chat UI` **minimum text path is PASS for one real Owner test in fixed Preview**, based on the combination of operator-observed reply/reload, bounded persistence readback, and previously verified canary/signed route infrastructure. It does **not** mean an independently instrumented HTTP trace covered every hop, or that OAuth browser automation passed.
- [ ] **Outside this acceptance:** production `CHAT_DISPATCH_ENABLED` remains OFF; no formal model-enabled traffic promotion, no broad multi-user access, no cross-Owner *live* browser isolation, no additional provider models. The original earlier failed-create-request root cause is still not independently identified. The `market-mart` and `life-assistant` runtime integrations remain separate OPEN gates. Human OAuth login *acceptance requirement* remains NOT_REQUIRED; no new manual OAuth gate is added.

# omniAgent acceptance matrix

### 2026-10-12 — P0 Owner Chat trace and two-Owner fixture release evidence

- **Historical diagnosis (read-only):** [#38204839509](https://github.com/tommylin15/omniAgent/actions/runs/38204839509) PASS as an audit run, with original Owner A 0/3 consumed, zero recent threads and turns, and an existing zero-traffic trial tag. Historical Cloud Logging request data and actual browser origin were unavailable. The **unique root cause remains UNDETERMINED**; this is not an Owner-provider acceptance PASS.
- **Automated code and isolated integration:** [#38205474617](https://github.com/tommylin15/omniAgent/actions/runs/38205474617) PASS for Node/Python/disposable PostgreSQL/Flutter. Two different Owner fixtures reject cross-owner reads and cancel; SSE Last-Event-ID replay, idempotency, approval and cancel, and nonbillable Codex text_delta plus terminal database receipt tested. No real Codex call in these tests.
- **Exact release:** [#38205681718](https://github.com/tommylin15/omniAgent/actions/runs/38205681718) GHCR quality and three images PASS; [#38206044698](https://github.com/tommylin15/omniAgent/actions/runs/38206044698) zero-traffic candidates PASS; [#38206163101](https://github.com/tommylin15/omniAgent/actions/runs/38206163101) signed smoke PASS; [#38206216152](https://github.com/tommylin15/omniAgent/actions/runs/38206216152) formal traffic and protected-ten retention overall PASS.
- **Independent real GCP readback:** [#38206616628](https://github.com/tommylin15/omniAgent/actions/runs/38206616628) PASS. Chat `00069-tep`, Gateway `00060-vup`, Shared `00046-naj`: correct 100% traffic, immutable SHA256, Ready, exactly ten protected revisions each. Chat health/UI and random request-ID plus Revision response header PASS; anonymous/invalid Google token 401 PASS.
- Production provider dispatch/BYOK OFF. Manual OAuth gate NOT_REQUIRED. No paid inference or trial-budget reset.
- **Still OPEN:** Owner A historical reply has no matching canonical DB turn; authenticated second real Google Owner E2E is `NOT_VERIFIED_AUTOMATION_UNAVAILABLE`; real paid Codex-to-PostgreSQL text and terminal persistence `NOT_VERIFIED`. The fixture PASS is not a substitute.


### 2026-10-12 11:06 Asia/Taipei — P0 durability receipt code-only release: VERIFIED

- Actual deployed source SHA: `8c269be520e773d289c7cd1f76fde186f6505c09`.
- Node/Python/PostgreSQL/Flutter exact-source quality & three GHCR images:
  [#38197726030](https://github.com/tommylin15/omniAgent/actions/runs/38197726030) PASS.
- Three Cloud Run immutable 0%-traffic candidates:
  [#38197918045](https://github.com/tommylin15/omniAgent/actions/runs/38197918045) PASS.
- Signed current-candidate smoke [#38198004938](https://github.com/tommylin15/omniAgent/actions/runs/38198004938) PASS.
- Formal release and guarded protected-ten cleanup:
  [#38198062058](https://github.com/tommylin15/omniAgent/actions/runs/38198062058)
  **overall PASS**; promotion, cleanup, receipt and artifact all succeeded.
- Independent GCP production readback:
  [#38198404857](https://github.com/tommylin15/omniAgent/actions/runs/38198404857)
  PASS: correct 100%-traffic Revision, immutable digest, Ready for all three;
  public Chat health/ready/UI 200, /v1/me, /v1/models and new
  /v1/threads/probe/turns/probe/receipt anonymous and invalid token 401.
- Promoted revisions: Chat `omniagent-chat-00066-log`, Gateway
  `omniagent-agent-gateway-00057-keb`, Shared `omniagent-shared-codex-00043-tiy`.
- Durable receipt endpoint tests include actual disposable PostgreSQL data:
  persisted text_delta + turn_completed + COMPLETED => durableCompleted true;
  QUEUED/absent rows => false/404, and an authenticated foreign Owner => 404.
  No message text, prompt, Secret, provider handle or native ID returned.
- Flutter proof label appears only after terminal SSE and same-Owner
  database receipt confirmation; failure remains UNVERIFIED. Flutter PASS:
  [#38197423549](https://github.com/tommylin15/omniAgent/actions/runs/38197423549).
- **Manual OAuth login NOT REQUIRED**; feasible automated IAM/HMAC/JWT
  negatives retained. Genuine real Google user token E2E unavailable to
  automation => NOT_VERIFIED_AUTOMATION_UNAVAILABLE, not fabricated PASS.
- **P0 live Owner application persistence still BLOCKED**: historical user
  Codex response cannot be matched with a DB turn (last evidence: 0/3
  consumed, zero new threads/turns). Only new read-only evidence plumbing
  and code-only production deployment are complete; no provider calls
  or budget resets. Production dispatch/BYOK remain OFF.


### 2026-10-12 P0 durable answer proof — code-only release target

- Owner-scoped GET `/v1/threads/{threadId}/turns/{turnId}/receipt`
  reads the canonical PostgreSQL turn + correlated events. It responds with
  only status and `textPersisted`, `terminalPersisted`, `durableCompleted`
  booleans; it never returns a prompt, model output, provider handle or token.
- Completed provider/UI status is insufficient: `durableCompleted=true` only
  after a COMPLETED turn, nonblank stored `text_delta`, and matching persisted
  `turn_completed` event for the verified Owner's thread and turn.
- Anonymous/service-identity-to-user-path requests return 401, cross-Owner
  queries return 404. Disposable PostgreSQL + signed fixture Gateway tests
  verify positive and A/B negative paths without any provider network call.
- Flutter receives this bounded read-only receipt only after a terminal SSE
  event for its *current* selected thread; a different Owner/session cannot
  inherit verification UI state. Otherwise show UNVERIFIED, not fake success.
- New source receipts: `d96de226` (DB-backed API, Owner isolation),
  `b16d9a15` (Flutter proof indicator), `3d5689ae` (lint correction).
- **Scope of this one-shot `[release-once]` deployment:** code-only,
  dispatch/BYOK OFF, no model inference, no trial budget reset and no manual
  OAuth verification. CI → GHCR → 0% candidate → signed smoke → formal
  traffic readback and protected-ten retention must be checked separately.
- Historical Owner A Codex reply versus canonical PostgreSQL 0 new
  thread/turns, budget 0/3 remains **BLOCKED**. This change adds independently
  verifiable evidence and does NOT reconstruct or fabricate historical rows.
- Do not mark model-functional acceptance complete without real future
  Owner-persisted events and automated cross-Owner runtime evidence.


### 2026-10-12 08:57 Asia/Taipei — GHCR technical release / protected ten CLOSED

- **Code-only release PASS**; service SHA
  `02ef7f682ed16e6bb4f0f57507bad4b88b8f02c2`.
- Exact-SHA quality + 3 public GHCR images: [#38188932105](https://github.com/tommylin15/omniAgent/actions/runs/38188932105) PASS.
- Three 0% candidates: [#38189081096](https://github.com/tommylin15/omniAgent/actions/runs/38189081096) PASS.
- Signed Chat/Web/private IAM smoke: [#38189158849](https://github.com/tommylin15/omniAgent/actions/runs/38189158849) PASS.
- One-shot formal promotion [#38189211789](https://github.com/tommylin15/omniAgent/actions/runs/38189211789):
  traffic switch Shared→Gateway→Chat **PASS**, but overall workflow
  **FAIL** because the subsequent cleanup refused a fallback older than ten;
  do not retroactively label this original run Success.
- Independent GCP postrelease traffic/digest/Ready/disabled-flags readback
  [#38189456623](https://github.com/tommylin15/omniAgent/actions/runs/38189456623) PASS.
- Protected-ten policy corrective commit
  [`f2148b64`](https://github.com/tommylin15/omniAgent/commit/f2148b64e663d361ae072db17a0c27237f4a491f)
  keeps the promoted GHCR primary, approved fallback, fixed Preview and
  still-tagged Owner trial; fills remaining slots chronologically (not
  necessarily the strict ten newest).
- Independent postrelease protected cleanup
  [#38189729745](https://github.com/tommylin15/omniAgent/actions/runs/38189729745)
  PASS: service-level dry-run, tag cleanup, safe revision deletion and
  100% traffic re-readback. **37** obsolete tagged routes removed:
  Shared 11 / Gateway 13 / Chat 13. **37** old Revisions deleted:
  Shared 11 / Gateway 13 / Chat 13. All three retain **exactly ten**.
- Verified production primary revisions: Chat `00063-zis`, Gateway
  `00054-met`, Shared `00040-pon`. Approved fallback revisions:
  Chat `00045-fer`, Gateway `00036-hid`, Shared `00024-naw`.
- **Manual OAuth acceptance REMOVED** per Owner policy. Automated negative
  auth/IAM/HMAC remains required. Production dispatch/BYOK **OFF**;
  no new billable provider inference or trial-budget reset.
- **Owner app P0 remains BLOCKED separately**: prior real Owner A observation
  is not matched by canonical PostgreSQL trial budget or new events (0/3
  readback), and production Owner-specific durable SSE, approval/cancel/
  reconnect and automated two-Owner cross-account runtime denial remain
  NOT VERIFIED. The technical release is not a model-function completion.


### 2026-10-12 post-promotion cleanup retention policy correction

- Source evidence: GHCR 02ef7f68 production traffic promotion PASS (#38189211789);
  independent Cloud Run production readback PASS (#38189456623), dispatch/BYOK OFF.
- Original ten-latest retention BLOCKED on Shared because fallback `00024-naw`
  is older than the most recent ten, after repeated 0%-trial/candidate revisions.
- Updated retention policy retains up to 10 **including** the approved
  promoted revision, verified immutable GHCR fallback, live fixed Preview,
  and owner-scoped trial tags. Chronological newest revisions fill remaining
  slots. It may not be strictly the newest ten; this is deliberate to avoid
  deleting the approved fallback or an active tagged URL.
- Runtime apply is a **separate gate**: tests, immutable current traffic
  readback, protected tag dry-run, tag mutations/readback, and revision
  deletion/readback must each PASS before saying cleanup is complete.


### 2026-10-12 Authorized technical release with automated OAuth security gate

- Scope: **code-only GHCR production release**, keep Chat dispatch and BYOK disabled;
  no further human OAuth sign-in checks. Current CI must run negative token/auth
  contract checks and signed smoke with anonymous IAM denials, digest/Secret protection.
- Preserve a separate application-level BLOCKED status for missing live
  Chat→Gateway→PostgreSQL persistence, SSE, Owner-isolation runtime evidence.
- New one-shot commit marker `[release-once]` authorizes only controlled
  GHCR Shared→Gateway→Chat promotion, ready/readback and ten-revision retention
  under the existing runbook (real rollback *rehearsal* remains waived).
- No extra Codex trial turns, Secret changes, trial-budget reset or artificial
  OAuth success. Workflows and Cloud Run evidence decide actual status.


### 2026-10-12 最新有效 OAuth 驗收政策

- **不再進行人工 OAuth 真人登入／A→B→A／Preview 驗收：NOT_REQUIRED，不是假造 PASS。**
- **保留全部可自動化 OAuth 身分及安全測試**：token issuer/audience、錯誤與匿名拒絕、Client 設定、Owner 綁定、IAM/HMAC、跨 Owner 負向測試。
- 缺少合法自動化真人使用者 token 時，僅該單項標為 NOT_VERIFIED_AUTOMATION_UNAVAILABLE；不可使用服務帳號 ID token 冒充真人登入，也不要求人工補測。
- 模型授權、Chat→Gateway→PostgreSQL/SSE 持久化、隔離、CI、部署及正式流量讀回仍各自驗收。之前 P0 資料庫衝突不因取消人工驗收而 PASS。
- 完整政策：[OAuth 自動驗收政策](../docs/oauth-automated-acceptance-policy.md)。下方歷史真人 OAuth 必經 gate 自本日起不再適用。


### 2026-10-11 23:49 Asia/Taipei — Owner A positive report vs DB evidence (BLOCKED)

- User reports authenticated trial-tag Google login and a real Codex reply on
  `effb7b08c8d59fa137d1dba6169752887df972ed` (operator observation).
- Live read-only PostgreSQL receipts [#38152437970](https://github.com/tommylin15/omniAgent/actions/runs/38152437970),
  [#38152649164](https://github.com/tommylin15/omniAgent/actions/runs/38152649164), and
  [#38152820347](https://github.com/tommylin15/omniAgent/actions/runs/38152820347)
  confirm the exact OAuth-backed Owner exists and owner-scoped FK/event linkage
  is intact, but the existing trial budget remains **0/3 consumed**, and the
  canonical `omniagent_chat` database contains **zero new threads / turns for
  that Owner since 2026-10-11 12:55 UTC** (any runtime/model).
- Exact trial tag still exists with 0% formal traffic. Cloud Logging request
  metadata lookup is **UNAVAILABLE** under current CI access. No raw message,
  ID, OAuth token, or Secret is in the receipts; no additional provider calls
  or DB changes were made by the audit.
- **Persistence/SSE and authenticated Owner B denial: NOT VERIFIED**. A real
  UI reply is not sufficient evidence of this PostgreSQL path. **Formal P0
  application promotion: BLOCKED** until end-to-end request routing and
  durable readback reconcile. Static ownership constraints alone are not a
  second real Owner login. Earlier code-only releases are historical, not this
  release. Do not reset the 3-turn budget or enable production dispatch/BYOK.


### 2026-10-10 Gemini Chat Owner policy — Flash-Lite only

- Owner decision: Gemini Chat/UI and the signed Gateway dispatch entrypoint allow
  only `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`,
  `gemini-2.5-flash-lite`. Ordinary Flash / Pro and preview identifiers
  cannot be selected for new Gemini Chat and are denied before provider network
  execution. Historical thread/event records remain intact.
- Chat `CHAT_DISPATCH_ENTITLEMENTS_JSON` must contain **only** these Gemini IDs;
  configurations referencing removed Gemini models fail closed at startup if
  dispatch is explicitly enabled. This policy does **not** turn on dispatch,
  import Owner Codex credentials, enable BYOK, or authorize provider charges.
- Google currently restricts Gemini 2.5 family API access to eligible
  previously active projects; availability and free quotas must be verified
  against the actual project's provider/runtime evidence, never inferred
  from the UI catalog. Official sources:
  https://ai.google.dev/gemini-api/docs/models and
  https://ai.google.dev/gemini-api/docs/pricing.
- Latest exact SHA tests / GHCR publish / 0%-candidate / full app runtime
  acceptance must be tracked separately as PASS/FAIL/NOT VERIFIED. Previous
  formal production revision remains the deployed baseline until a new
  verified explicit promotion. No rollback exercise is newly required.


### 2026-10-10 12:04 Asia/Taipei — executed GHCR release and last-ten retention

- Deployed application SHA: `d48865890038a8373d5abc27fb5da92dc511fc92`.
- Full quality and three GHCR images: PASS [#38022086997](https://github.com/tommylin15/omniAgent/actions/runs/38022086997).
- Three 0% Cloud Run candidates: PASS [#38022276090](https://github.com/tommylin15/omniAgent/actions/runs/38022276090).
- Signed runtime candidate smoke: PASS [#38022346384](https://github.com/tommylin15/omniAgent/actions/runs/38022346384).
- Read-only current GHCR candidate/fallback technical audit: PASS [#38022379125](https://github.com/tommylin15/omniAgent/actions/runs/38022379125).
- One-shot release [#38022379285](https://github.com/tommylin15/omniAgent/actions/runs/38022379285): protected formal traffic promotion step PASS, and protected obsolete-tag/latest-ten cleanup step PASS. **Overall Actions run FAIL solely because the later receipt preservation step attempted `cp` onto the same path.** Its artifact upload succeeded; this patch corrects the packaging script for future runs, but it does NOT retroactively make the historical run green.
- Three 100%-traffic promoted revisions (release script readback PASS): Chat `omniagent-chat-00048-mak`, Gateway `omniagent-agent-gateway-00039-qoz`, Shared `omniagent-shared-codex-00027-qiy`.
- Protected fallback revisions retained without a rehearsal: Chat `00045-fer`, Gateway `00036-hid`, Shared `00024-naw`.
- Cleanup actual apply receipts: Chat 25 deleted; Gateway 21 deleted; Shared 16 deleted. **62 deleted, exactly 10 retained per service; 51 obsolete tags removed** (21 Chat, 18 Gateway, 12 Shared). These values come from the release job's GCP deletion/readback output, not a document inference.
- Rollback rehearsal deliberately WAIVED by owner; disabled-by-default dispatch/BYOK remains disabled. Real owner-specific inference, persisted provider SSE and approval/cancel/reconnect are NOT VERIFIED; final complete product acceptance remains PARTIAL.
- This post-release source/doc receipt maintenance commit is `[skip ci]`, intentionally does not launch new GHCR candidates after the completed latest-ten cleanup. Promoted application digest/source remains the release SHA above.



### 2026-10-10 Production request evidence: preflight is NOT promotion

Latest exact-source 78225a7f candidate CI, GHCR, 0% Cloud Run and signed
Smoke all PASS: GHCR #38012644521, candidate #38012934671,
Smoke #38013023792. New optional read-only production readiness audit uses
a GHCR fallback at eb61d6e4 and must prove it Ready, digest-bound and
Secret versions enabled in the *current* runtime. It must not change
traffic, invoke models, access Secret payloads or fabricate human evidence.
Owner-approved model execution, real durable Chat→Gateway persisted events,
approval/cancel/reconnect, true Owner A/B isolation on this release,
a full live Shared caller acceptance and actual GHCR-only rollback exercise
remain OPEN. Formal promotion/cleanup must stay blocked until accepted.


### FR-013 BYOK credential metadata staging — 2026-10-10

New additive schema 003, owner-scoped metadata registry, isolated Secret
Manager vault adapter, authenticated API and negative tests are CODE STAGED.
The flag CHAT_BYOK_MANAGEMENT_ENABLED remains unset in runtime.
No real Secret Manager operations, BYOK provider inference, Gateway resolver,
credential rotation/recovery or cross-owner live acceptance has passed.
PENDING/REVOKING records fail closed and cannot be used by resolver.
Exact-SHA CI, 0% candidate, approved IAM/migration and live acceptance
are separately required. See docs/credential-resolver.md.


### 2026-10-10 Read-only reconciliation diagnostic

An internal-service-only endpoint and owner-scoped SQL report RUNNING candidates based on queue creation age, with a maximum of 50 entries. No mutations or provider calls. Explicitly NOT an authoritative runtime-duration measurement and not a license to retry. Source changes need exact-SHA CI and runtime verification.


### 2026-10-10 model entitlement and OpenRouter SSE test scope

Source adds a second explicit Owner/Runtime/Model platform credential
entitlement, alongside previous Owner IDs and disabled-default dispatch.
Chat rejects unentitled message submissions before any queue write;
worker filters its database claim to entitled tuples. Tests exercise
owner/model mismatch, BYOK rejection, free-only model constraints and
worker/SQL filtering. OpenRouter requires [DONE] for terminal success;
truncated/error/oversized frames are rejected, and split UTF-8 accepted.
**CODE ONLY**, until exact-SHA CI and later separately approved live
Owner/model/DB SSE acceptance. No billable inference or Secret access.


### Groq adapter source contract (2026-10-10)

The isolated text-only Groq Chat Completions adapter and its mocked
contract cases are staged without Gateway routing, credentials, runtime
environment changes or UI enablement. A separate execution gate defaults
off, even when a valid API key exists. Validation includes safe HTTP
failure mapping, strict provider-response projection, bounded messages,
model identifiers and completion cap. **SOURCE ONLY**; does not count as
real Groq inference or owner-credential acceptance. Do not expose Groq
as live in Flutter without the approved credential resolver, entitlements
and an independently accepted provider end-to-end test.

### Flutter owner/thread selection race (2026-10-10)

A per-selection generation guard invalidates stale, failed or delayed
event replay responses and prevents the prior selection's poller from
being resurrected. A new selection no longer waits on the previous
thread's in-flight request. Widget regression tests this overlap.
Source-only until exact-SHA Flutter CI and live visual verification
prove success; periodic polling is still present and streaming upgrade
remains OPEN.

### Chat Gateway transactional event batch (2026-10-10)

A single owner-scoped PostgreSQL transaction now encompasses every
validated Gateway response event and terminal turn update. Disposable
DB acceptance injects a failure on event #2 to prove event #1 is rolled
back and the turn remains RUNNING; no automatic provider retry is
permitted. Source/test change is **STAGED-CODE**, not real provider
inference/replay PASS; exact-SHA CI and live owner acceptance are pending.

## 2026-10-10 staged code and deferred unified acceptance

Fixed Preview guarded publisher and non-destructive safety tests are
**STAGED-CODE** only. It is disabled unless repository variable
`OMNIAGENT_AUTO_PREVIEW_ENABLED=true` is separately set after
approval. Unit/CI verification, actual fixed-preview publication and
failure recovery, human fixed-origin OAuth, real provider turn/replay,
approved GHCR-only production rollback, and Revision retention all
require the later consolidated run. Prior operator A→B→A evidence is
limited to the previously checked browser origin; do not generalize it
to the new fixed Preview. No model entitlement or billable dispatch
is granted by this code change.

## 2026-10-09 正式流量已切換；產品驗收仍未完成

依使用者明確授權，GHCR release `1a8e575bb9f6224e698765d268c6e823e94ba55a` 已固定為三服務 100% 正式流量：Chat `00039-rik`、Gateway `00030-coy`、Shared `00019-puf`，live readback 均 Ready=True。正式 Chat health/ready/UI 資產 200，匿名 API 401。Gateway 一個指向 DESTROYED Secret 的失效歷史標籤已移除以完成路由更新；未刪 revision、Secret 或資料。

[完整發布證據與前後快照](../docs/production-promotion-2026-10-09.md)。這次是使用者授權的流量切換，未完成既有全部 release gates；真實 Chat provider dispatch、持久化 SSE replay、owner Codex mapping、approval/cancel/reconnect 與正式 rollback 演練仍 OPEN。舊紀錄中的「正式流量未變更」僅適用其各自歷史 checkpoint。不得因此啟用 retention 或舊資源清理。


## Replacement CI/CD — GitHub Actions / public GHCR / Cloud Run (OPEN)

**2026-10-09 latest new-GHCR-only live readback (post-candidate):**
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

**2026-10-09 most recent Chat→Gateway local-vs-live acceptance:**
- **PASS — local signed HTTP with synthetic no-cost Provider:** commit
  `f9a4a7b5d4d226d47af6aa526d49d10737b44406` verifies signed
  Chat invoker → real Gateway HTTP handler → fixture output →
  ChatDispatcher owner-bound event persistence calls. Invalid HMAC
  rejected before Provider execution. [CI/GHCR #37924500076](https://github.com/tommylin15/omniAgent/actions/runs/37924500076).
- **PASS — latest immutable GHCR 0% candidates and IAM smoke:**
  [deployment #37924894616](https://github.com/tommylin15/omniAgent/actions/runs/37924894616),
  [smoke #37925039627](https://github.com/tommylin15/omniAgent/actions/runs/37925039627).
  New Revisions Chat `00038-yog`, Gateway `00029-ter`,
  Shared `00018-poq`. No formal serving traffic change.
- **PASS READ-ONLY CONFIG / LIVE INTEGRATION BLOCKED:**
  [re-run #37925330111](https://github.com/tommylin15/omniAgent/actions/runs/37925330111)
  proved Chat dispatch disabled, approved Owner count **0**,
  no matching Gateway URL/Audience, and no direct Gateway
  `CODEX_OWNER_SECRETS` entry. Gateway's bundle reference exists,
  but the code does not import owner-specific Codex auth from it.
  Secret payloads not inspected. Failed first workflow attempt
  #37925220817 was fixed by `eea5af5b`; do not count it as PASS.
- **OPERATOR-REPORTED MANUAL PASS** — two-account A→B→A browser UI
  login and data isolation (previously completed).
- **NOT VERIFIED** — live positive signed Chat call, approved-owner
  Codex model request, durable DB model output and UI SSE replay,
  100% production traffic promotion and GHCR-only rollback drill.

**2026-10-09 browser A → B → A — OPERATOR-REPORTED MANUAL PASS:**
The user finished the Google OAuth account-switch acceptance at the
public 0%-traffic GHCR Chat candidate and confirmed that **B could
not see A's thread**, then **A could see its earlier thread again**
after signing back in. This closes the **manual UI two-account
visibility/isolation check**, not the independent backend/live-owner
database readback, and not Chat→Gateway/provider round-trip. No
account details or OAuth credentials were requested or recorded.
**Still NOT VERIFIED:** approved owner entitlement, positive signed
Gateway provider dispatch, durable streamed response replay, real
production release and GHCR-only rollback drill.

**2026-10-09 actual zero-traffic Chat/Gateway authentication negative contract:**
[GitHub Actions #37917980938](https://github.com/tommylin15/omniAgent/actions/runs/37917980938)
**PASS** for candidate SHA `f2a5be4425953b26f2340694765362c7bdc943c9`.
Anonymous Chat API denied, anonymous Gateway health denied,
actual `omniagent-chat` IAM principal granted signed Cloud Run
Gateway health, and all absent/invalid/expired HMAC cases rejected
HTTP 400. **No accepted HMAC/provider invocation**, no persisted
events in that automated test and no browser Google OAuth observation
by the workflow. The separate two-account browser check is now
**OPERATOR-REPORTED MANUAL PASS**, not independently backend-verified. The test did not access Secret payloads or switch
traffic. Candidate browser URL discovered by authoritative GCP traffic
tag readback is
`https://ghcr-f2a5be442595---omniagent-chat-2oo7qbkd5q-uc.a.run.app`.
Required human OAuth acceptance: two distinct accounts, account-switch
isolation, A's saved thread visible again only to A. Report status
without sending account identifiers or credentials. Record this as
**operator-reported** until corroborated by actual backend owner-scoped
persistence evidence. No unapproved model/provider calls.

**2026-10-09 current proof (new GHCR path, NOT formal release):**
- **PASS — new guarded last-ten tag-retirement implementation/tests:**
  `f2a5be4425953b26f2340694765362c7bdc943c9`;
  [full CI + 3 public GHCR images #37915501123](https://github.com/tommylin15/omniAgent/actions/runs/37915501123)
  passed. Conditional `workflow_call` now requires BOTH
  `acceptance_and_promotion_passed` and
  `older_tag_dependencies_cleared` before tag or Revision mutation.
  Under this prerequisite, retirement dry-runs and removes only
  tags outside last ten with strict fresh readback. Unit tests
  simulate safe/unsafe flows; **live destructive execution NOT DONE**.
- **PASS — exact-source latest 0% candidate deployment and signed Smoke:**
  [#37915797147](https://github.com/tommylin15/omniAgent/actions/runs/37915797147)
  → [#37915994575](https://github.com/tommylin15/omniAgent/actions/runs/37915994575),
  new Revisions Chat `00037-duj`, Gateway `00028-rof`,
  Shared `00017-lob`; original formal traffic unchanged.
- **PASS — new-GHCR-only fallback and actual Shared provider calls:**
  [#37916199053](https://github.com/tommylin15/omniAgent/actions/runs/37916199053)
  verifies new primary and preceding `6ab6422` GHCR revisions Ready,
  immutable digests, healthy Secret metadata, 0% tags;
  [#37916199074](https://github.com/tommylin15/omniAgent/actions/runs/37916199074)
  exercises real Shared inference for all three caller identities,
  separate threads and cross-project denial.
- **PASS — refreshed read-only revision inventory:**
  [#37916199040](https://github.com/tommylin15/omniAgent/actions/runs/37916199040)
  shows Chat 26, Gateway 22, Shared 17 Revisions:
  **65 total, 35 above the ten-per-service target**.
  **25 old tagged Revision routes** are outside the newest ten
  (Chat 12, Gateway 10, Shared 3).
  Three old serving revisions still receive 100% formal traffic and
  lie outside the newest ten; deletion MUST NOT occur yet.
- **BLOCKED — formal app/release gates:** independently evidenced owner
  binding plus approved owner dispatch, real Chat→Gateway/provider
  persistence, GHCR-only 100% traffic cutover and rollback rehearsal,
  older tag URL dependency audit and eventual last-ten cleanup.
  The old Cloud Build/AR rollback mechanism is NOT a prerequisite.

Owner decision 2026-10-08. Requirements below are final production
gates. Some source/build/candidate sub-gates now have observed PASS, while
**Shared real inference PASS for both verified GHCR release sets; human
browser OAuth/two-owner identity, Chat↔Gateway durable provider dispatch,
formal traffic promotion, actual new-GHCR-only traffic rollback drill and
ten-Revision cleanup remain OPEN**. Legacy Cloud Build/AR rollback is no
longer a prerequisite per the 2026-10-09 owner authorization.

**2026-10-09 gate #3 read-only GCP last-ten inventory — PASS; cleanup BLOCKED:**
[Inventory #37914559743](https://github.com/tommylin15/omniAgent/actions/runs/37914559743)
and [precise tagged/serving preflight #37914953148](https://github.com/tommylin15/omniAgent/actions/runs/37914953148)
proved Chat 25, Gateway 21, Shared 16 current Revisions; excess
15 + 11 + 6 = **32**, deletion count **zero**.
A total of **22 tag references on beyond-ten Revisions**
(Chat 11 / Gateway 9 / Shared 2) still exist. All three active
100%-serving Revisions are outside the latest ten, whereas both
approved GHCR-only primary and fallback pairs are inside. Removal
of older tags can invalidate tagged URLs; review actual dependencies
before a post-promotion tag change.
**No tag mutation, traffic reassignment, Revision deletion, Secret
payload read or database write** was performed.
These are concrete prerequisites for post-promotion revision pruning,
not a waiver of application acceptance, a traffic rollback drill
or legacy rollback dependency.

**2026-10-09 Chat hardening and current GHCR candidate verification:**
- **PASS — owner-bound event safety:** commit
  `6ab64229738bb75490231aed93e0d0d759c3aa4b` denies Gateway
  responses with a foreign `ownerId` before writing any model output,
  for Gemini and Codex-native bindings. Node/Python/PostgreSQL/Flutter
  CI and 3 public immutable GHCR packages:
  [#37903996197](https://github.com/tommylin15/omniAgent/actions/runs/37903996197).
- **PASS — exact-source live 0% candidates:**
  Chat `omniagent-chat-00036-pev`, Gateway
  `omniagent-agent-gateway-00027-suw`, Shared
  `omniagent-shared-codex-00016-jaz`;
  [deployment #37904503766](https://github.com/tommylin15/omniAgent/actions/runs/37904503766),
  [auto signed Smoke #37904670566](https://github.com/tommylin15/omniAgent/actions/runs/37904670566);
  both **SUCCESS**, formal traffic unchanged.
- **PASS — strict GHCR-only fallback metadata:**
  previous SHA `c6020ed87fcf4b696f5816e23a34ba7b18350ebb` with
  Chat `00035-ker`, Gateway `00026-xum`, Shared `00015-gew`;
  [#37904836739](https://github.com/tommylin15/omniAgent/actions/runs/37904836739)
  verifies all six Ready, digest, tagged 0%-traffic and ENABLED Secret
  references. This does not prove a real traffic rollback drill.
- **PASS — current Shared real 3-caller provider inference:**
  [#37904946565](https://github.com/tommylin15/omniAgent/actions/runs/37904946565)
  with isolated threads, cross-project denials and traffic protection.
- **PASS (read-only settings inventory), but application integration BLOCKED:**
  [Chat candidate config #37903833063](https://github.com/tommylin15/omniAgent/actions/runs/37903833063)
  shows OAuth Client and internal identity configuration present, while
  `CHAT_DISPATCH_ENABLED` is DISABLED, approved Owner UUIDs = 0,
  candidate Gateway URL/audience do not match. No Secret payload reads,
  DB test writes, model provider calls or traffic changes were made by
  this preflight. Actual two-human-account browser Google OAuth and
  authorized owner-to-Gateway dispatch/provider-event persistence are
  **NOT VERIFIED**; they are prerequisites for formal promotion.
- **Still OPEN:** real app E2E and authorized owner entitlements, bounded
  GHCR-only traffic promotion/rollback rehearsal and 10-revision
  retention. Prior Cloud Build/AR rollback is not a dependency.

**2026-10-09 earlier new-only GHCR release/rollback checkpoint:**
- **PASS — newer exact-source CI/GHCR/candidate/automatic Smoke:**
  `c6020ed87fcf4b696f5816e23a34ba7b18350ebb`:
  [publish #37896498492](https://github.com/tommylin15/omniAgent/actions/runs/37896498492)
  → [candidate #37896743989](https://github.com/tommylin15/omniAgent/actions/runs/37896743989)
  → [auto smoke #37896904915](https://github.com/tommylin15/omniAgent/actions/runs/37896904915),
  all **SUCCESS**. Current Chat `00035-ker`, Gateway `00026-xum`,
  Shared `00015-gew`, each GHCR-pinned, Ready, and 0% formal traffic.
- **PASS — previous new-GHCR recovery target read-only viability:**
  `c7f32b23d4ac4b60d43b3108e69e5b4019e31321` Chat
  `00034-vul`, Gateway `00025-jom`, Shared `00014-lij`.
  [GHCR-only two-release preflight #37897007278](https://github.com/tommylin15/omniAgent/actions/runs/37897007278)
  verified **all six** Ready conditions, immutable digests, tags, enabled
  Secret states, and unchanged formal traffic. Not an actual
  100% → prior-GHCR → 100% traffic rollback drill.
- **FAIL (superseded fallback; intentionally excluded):**
  [#37896367974](https://github.com/tommylin15/omniAgent/actions/runs/37896367974)
  found a previously published GHCR Gateway candidate bound to
  `omniagent-bundle:2` (DESTROYED). Historical Ready is not evidence
  of current rollback safety; this fallback is not eligible.
- **PASS — three-caller real Shared Codex execution:**
  previous verified candidate
  [#37896120562](https://github.com/tommylin15/omniAgent/actions/runs/37896120562)
  and new primary
  [#37897135903](https://github.com/tommylin15/omniAgent/actions/runs/37897135903)
  each returned real inference for the three approved caller principals,
  used isolated fresh threads, denied cross-project calls and preserved
  production traffic.
- **OPEN/BLOCKED — actual release:** human browser OAuth and cross-owner
  account isolation, enabled Chat↔Gateway provider dispatch and replay,
  real rollback traffic rehearsal and formal promotion not yet
  established. No legacy Cloud Build/AR rollback target is required, but
  **missing application acceptance is not waived**. No formal traffic or
  Revision deletion mutation has occurred.

**2026-10-09 earlier Gate #1 — FULLY AUTOMATIC replacement path: PASS**
for immutable source SHA `c7f32b23d4ac4b60d43b3108e69e5b4019e31321`.
[CI/full quality + 3 GHCR #37894051418](https://github.com/tommylin15/omniAgent/actions/runs/37894051418)
**SUCCESS** triggered
[3 Cloud Run zero-traffic candidate revisions #37894312427](https://github.com/tommylin15/omniAgent/actions/runs/37894312427)
**SUCCESS** triggered
[read-only signed live Smoke #37894440766](https://github.com/tommylin15/omniAgent/actions/runs/37894440766)
**SUCCESS**.
Verified Chat `omniagent-chat-00034-vul`,
Gateway `omniagent-agent-gateway-00025-jom`,
Shared `omniagent-shared-codex-00014-lij`, each Ready,
digest-pinned 0% candidate, formal serving route preserved 100% on
the original service revision. Chat /health, /ready and Flutter web HTTP 200;
unauthorized API/dispatch HTTP 401; anonymous Gateway/Shared HTTP 403;
signed authorized Gateway health and Shared health/readiness HTTP 200.
Gateway `gcloud run deploy` CLI reported a nonzero code referencing
previous FAILED tagged revision `omniagent-agent-gateway-00021-boq`
with destroyed Secret version `2`; newer Gateway candidate
`00025-jom` was proven Ready, correct image/tag, secure single
`omniagent-bundle:latest` reference and 0% formal traffic via
independent Cloud Run readback. The workflow retains CLI exit evidence
and fails closed unless a new matching Ready/immutable zero-traffic
revision is verified. Old failed tag remains an explicit diagnostic
anomaly, not a reason to mutate formal traffic or delete historic versions.
**At this older checkpoint** application E2E, browser owners,
real Shared inference, production cutover/rollback and retention were
OPEN; the newer Shared inference sub-gate has now PASSED as documented above.

**2026-10-09 current-path auto-trigger gate** (source
`7937447dd85ef78dbabfe0ca7fd05a703dd99e3c`):
- **PASS — push → exact-source full quality → three GHCR image publishes:**
  [run #37876825619](https://github.com/tommylin15/omniAgent/actions/runs/37876825619).
- **PASS — successful publisher event automatically starts candidate:**
  [workflow_run #37877047775](https://github.com/tommylin15/omniAgent/actions/runs/37877047775).
  Three public immutable GHCR digests checked. Chat revision
  `omniagent-chat-00030-puq` deployed at 0%.
- **FAIL/BLOCKED — complete three-service candidates:** Gateway deployment
  rejected Secret Manager `omniagent-bundle` version `2` as `DESTROYED`
  for existing environment references. Shared never attempted. No formal
  promotion. An approved live Secret/config recovery is required, not a
  synthetic or code-only PASS.
- **PASS — failure-path downstream trigger and safe skip:**
  [smoke workflow_run #37877114127](https://github.com/tommylin15/omniAgent/actions/runs/37877114127)
  was automatically created and skipped after candidate failure.
  **NOT VERIFIED — successful candidate → automatically passing smoke.**
  Full three-service post-failure traffic readback is also unverified.
- Result: **trigger topology PASS; successful end-to-end automatic release
  candidate + smoke BLOCKED.** Formal cutover, rollback and keep-ten
  revisions remain separate OPEN gates.

**2026-10-09 fail-closed Secret version preflight** (source
`e6ef98a7548b40d9807f5ce22e70a6b2795b8e75`):
- **PASS**: full quality, three fresh public GHCR images
  [publish #37877688902](https://github.com/tommylin15/omniAgent/actions/runs/37877688902).
- **PASS**: service/traffic snapshot and all three GHCR digests checked by
  [candidate #37877905596](https://github.com/tommylin15/omniAgent/actions/runs/37877905596).
  Existing formal serving revisions each remained at 100%.
- **PASS (safety)**: `candidate_secret_version_preflight=BLOCKED`,
  every candidate deployment step **SKIPPED before any mutation** because
  CI cannot verify the `omniagent-bundle` Secret version states. This is
  intentional fail-closed behavior. Downstream
  [smoke #37877968631](https://github.com/tommylin15/omniAgent/actions/runs/37877968631)
  automatically SKIPPED.
- **BLOCKED (live recovery)**: Gateway still references Secret version
  `2` explicitly destroyed per prior Cloud Run deployment error; CI
  lacks scoped `secretmanager.versions.get` metadata read for the bundle.
  An authorized administrator must grant metadata-only Secret-scoped access
  and validate an ENABLED, application-compatible replacement before a
  protected zero-traffic-only reference change. **No Secret payload read,
  credential replacement, live production promotion, rollback or keep-ten
  cleanup has been carried out.**

**2026-10-08 verified intermediate evidence** ([detail](../docs/cicd-transition-runtime-evidence.md)):

- [x] Exact SHA `3cf40bc7a9223a5ce7efa630dbd837c4ff57a46a` Node/Python/PostgreSQL/Flutter quality and three public GHCR SHA-256 images: [publish #37768680175](https://github.com/tommylin15/omniAgent/actions/runs/37768680175).
- [x] Three GHCR images anonymously readable and pinned 0%-traffic Cloud Run candidates created without formal traffic changes: [#37768993666 attempt 2](https://github.com/tommylin15/omniAgent/actions/runs/37768993666).
- [x] Candidate image digest/current-serving traffic readback, Chat `/ready=200`, Flutter static Web and unauthenticated API rejection: [#37773167073](https://github.com/tommylin15/omniAgent/actions/runs/37773167073), [#37773639139](https://github.com/tommylin15/omniAgent/actions/runs/37773639139).
- [x] Signed existing Chat identity can invoke Gateway candidate `/health=200` using only narrow IAM `generateIdToken`; signed Shared candidate `/health` and `/ready=200`: [#37773639139](https://github.com/tommylin15/omniAgent/actions/runs/37773639139).
- [ ] **Shared candidate REAL inference remains BLOCKED**: HTTP 502 [#37773850397](https://github.com/tommylin15/omniAgent/actions/runs/37773850397); old AR serving runtime control also returned 502 [#37774120512](https://github.com/tommylin15/omniAgent/actions/runs/37774120512). Public GHCR native CLI binary 0.153.4 smoke PASS [#37774590569](https://github.com/tommylin15/omniAgent/actions/runs/37774590569). CI Cloud Logging diagnostic NOT_AUTHORIZED; do not claim root cause.
- [ ] Full real browser identity/two-owner isolation, signed provider E2E and dispatcher, actual rollback and promotion, 10-revision deletion/readback, old triggers retirement and GCS/AR cleanup remain unaccepted.

- [ ] Normal `main` push runs exact-SHA full Node/API/security, disposable PostgreSQL, Flutter, Python and hygiene gates; observed Actions PASS.
- [ ] All three images published from that SHA, public GHCR visibility and anonymous digest retrieval demonstrated; no credentials embedded.
- [ ] WIF identity/claim restrictions and least privilege GCP permissions read back.
- [ ] Three existing Cloud Run candidate revisions from matching immutable digests, 0% formal traffic and runtime identity/Secret/ingress/VPC/OAuth readback PASS.
- [ ] Live Chat/UI/browser two-owner/provider/dispatcher and Shared three-caller/integration gates PASS; no synthetic pass for unavailable components.
- [ ] Safe promotion, original traffic snapshot, actual rollback drill and traffic readback PASS; stale/partial release cannot alter serving allocation.
- [ ] Final successful deployment job runs ten-revision retention separately for Chat, Gateway and Shared: keep newest 10 (or all if fewer), including the exact latest promoted 100%-traffic revision and previously recorded known-good rollback target. Dry-run, per-deletion state revalidation and final readback PASS; tagged/serving older revisions or rollback outside newest 10 BLOCK cleanup rather than force deletion. Confirm GHCR images unchanged and actual Cloud Run state/permissions.
- [ ] Old Cloud Build push/release triggers disabled only after replacement success; verified new path does not run Cloud Build, explicitly write GCS/Artifact Registry or create Compute Engine.
- [ ] Legacy GCS/Artifact Registry retirement gate: live inventory (all
  buckets/objects and AR images/tags/digests/**repositories**) with owners,
  runtime/service/job/execution dependencies and rollback source; classify
  shared/unknown as BLOCKED; exact-target dry-run + owner-approved manifest
  before deletion and post-delete readback/health. See
  [retirement plan](../docs/legacy-gcs-ar-retirement.md).
  No object, Docker image or repository deletion is claimed from documents.
- [ ] Optional legacy Cloud Build read-only Actions bridge WIF, build status, failure steps and masked error summary tested; no mutation or raw secret exposure.

See [policy](spec.md#8-cicd--github-actions--public-ghcr--cloud-run-2026-10-08)
and [new release runbook](../docs/cicd-ghcr-actions-runbook.md).

## CI/CD V2 checkpoint — ACTIVE / PARTIAL

Four paths: Chat API, Flutter bundled in Chat, Gateway, Shared Codex. Main Push
CI and explicit full-SHA Release are separate. Source safety checks are executable
in `tests/test_cicd_v2.py`; main `741b4e0c` CI PASS and Shared three-caller live
responses/isolation PASS. Chat candidate is zero-traffic, health 200/readiness 503;
Gateway not deployed, recovery and cleanup gates FAIL. Existing provider Secret
absence, human Google Web identity and durable dispatcher gates stay OPEN.
No canonical release, image cleanup or CLOSED claim is made from source tests.

Evidence and operator commands: [V2 runbook](../docs/cicd-v2-runbook.md).
Paused observed results: [V2 evidence](../docs/cicd-v2-evidence.md#paused-checkpoint--2026-10-08).
Owner requested engineering pause and documentation save only.

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
| OAuth/owner | Automated issuer/audience/subject, negative auth and Owner binding; human login NOT_REQUIRED | AUTOMATED PARTIAL |
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

- [x] Gateway source reads `OMNIAGENT_PROVIDER_BUNDLE` and maps
  `mcp_owner_signing_key` → `MCP_OWNER_SIGNING_KEY`.
- [ ] Owner-approved single `omniagent-bundle` must contain four fields
  including `chat_database_url`; Cloud Run Chat and Gateway bindings,
  new key/version and real signed provider calls need runtime acceptance.
  Previous source implementation is not proof of deployed signing-key presence.
- [x] no active config depends on `omniagent-internal-signing-key`.
- [x] Node Core run `37628904846` PASS after the ownership cleanup.
- [ ] `OMNIAGENT_GCP_WIF_PROVIDER` configured and preflight PASS.
- [ ] `OMNIAGENT_GCP_CI_SERVICE_ACCOUNT` configured and proven least-privilege.
- [ ] Historical Artifact Registry build/deploy gate (legacy checkpoint only; **not** required or to be granted for the new public GHCR path).
- [ ] live Cloud Run configuration proves the provider bundle is injected without exposing its value.
