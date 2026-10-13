# P0 Owner Chat — implementation and single acceptance gate

### 2026-10-12 P0 incident correlation and reproducible nonbillable acceptance

Historical audit [#38204839509](https://github.com/tommylin15/omniAgent/actions/runs/38204839509) showed valid Owner A DB mapping and trial tag, but zero new canonical turns and 0/3 consumed; historical Cloud Logging request results and human browser origin could not be retrieved. **Do not assign a unique cause** or recreate a missing turn. This script performed only read-only queries.

For future Chat requests use the **random** `X-OmniAgent-Request-Id` returned by API (also displayed after sending in the current authenticated Chat UI), plus `X-OmniAgent-Revision`. With approved Cloud Logging access, search `kind=omniagent_chat_request_audit` and the reference. Fixed phases distinguish `thread_committed`, `message_committed`, `message_idempotent`, `dispatch_settled`, `dispatch_needs_reconciliation`, `receipt_readback`, `sse_replay` and `request_failed`. Logs contain no Owner ID, thread/turn ID, Google subject, credential, prompt, response or URL. A request ID is **not an authentication credential**; identity comes from verified Google user ID token, storage reads remain Owner-bound.

Local repeatable gate: isolated PostgreSQL migrations + signed real HTTP Gateway handler with nonbillable provider fixture. Validate two Owner DB IDs and 404 on cross-owner thread/receipt/cancel; SSE Last-Event-ID reconnect; same idempotency key yields one Gateway invocation and terminal event; native Codex simulated approval, cancel, text_delta and turn_completed; independently read `turnReceipt.durableCompleted`. A text UI or provider status cannot replace this DB readback.

Technical release [#38206216152](https://github.com/tommylin15/omniAgent/actions/runs/38206216152) and independent Cloud Run verification [#38206616628](https://github.com/tommylin15/omniAgent/actions/runs/38206616628) both PASS with SHA `02b91affc71cfa0654dafa853c1157483a09bfd6`, 100% production traffic, Ready, exact images, ten protected revisions, working HTTP correlation headers and anonymous/invalid OAuth denial. Dispatch and BYOK stay OFF. No paid model called; the real two-Owner Google OAuth negative and real provider-to-DB persistence remain separate NOT VERIFIED gates. Do not reinstate manual Google OAuth acceptance.


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


## 2026-10-12 OAuth 人工驗收不再要求

Owner 不再需要真人登入 Google、A→B→A 帳號切換、開啟 trial 或 Preview 網址做 OAuth 驗收（NOT_REQUIRED，非 PASS）。保留所有可由 CI/GCP 完成的 OAuth 身分、JWT、IAM/HMAC、DB Owner 綁定與跨 Owner 安全負向測試。若無合法的自動化真人 Google user token，該項明記 NOT_VERIFIED_AUTOMATION_UNAVAILABLE，不再請 Owner 人工補驗。先前 Owner A 的畫面回覆與 PostgreSQL 0/3、無新資料的衝突仍未通過驗收；不得藉此政策豁免。詳見 [政策](oauth-automated-acceptance-policy.md)。


**Scope:** Chat Owner model entitlements, Gemini Flash-Lite allowlist,
Codex native turn start / approval / cancel / refresh, PostgreSQL replay,
Flutter state / A-B isolation, and one-shot release authorization behavior.

**Do not infer DONE from source or CI alone.** Until there is a documented
exact-SHA, signed Cloud Run candidate, real Owner binding and permitted
provider readback, production application P0 is **NOT VERIFIED**.

## Preflight and deployment prerequisites

1. Validate `main` tests / GHCR quality and three public immutable images
   for the *same* commit; reject stale commits.
2. Apply only omniAgent additive PostgreSQL migration
   `infra/postgres/migrations/004_codex_live_turns.sql` after 001/002/003,
   with audited database readback. Migration 004 is idempotent and contains
   no data deletion.
3. `CHAT_DISPATCH_ENABLED` remains **false** unless an Owner approves a
   bounded real provider test. Google OAuth alone does not authorize
   inferencing. Enablement requires `CHAT_DISPATCH_APPROVED_OWNER_IDS`,
   exact `CHAT_DISPATCH_ENTITLEMENTS_JSON`, matching private
   `CHAT_GATEWAY_URL` and `CHAT_GATEWAY_AUDIENCE`, an enabled
   `mcp_owner_signing_key` in the service bundle and approved Gateway IAM.
4. Codex additionally requires explicitly Owner-bound
   `CODEX_OWNER_SECRETS` mapping to managed Secret Manager resources on the
   Gateway. Never put auth payloads, API keys, handles or identifiers into
   repository config or test receipts. Gemini Chat allows only the three
   Flash-Lite identifiers; paid inference is never inferred from the catalog.
5. Gateway native sessions currently use **process-local handles** (up to
   ten minutes). Set and verify single-instance routing/affinity before
   live continuation tests; a restarted/missing session must produce
   a reconciliation error, not an implicit second inference.

## Chat-facing endpoints

- `GET /v1/me` and `GET /v1/models` return only the verified Owner
  identity and allowed model metadata.
- `POST /v1/threads/:thread/messages` persists one idempotent Owner turn;
  non-Codex runtimes retain bounded atomic terminal event writes.
- Codex uses signed Gateway `/internal/v1/assistant/turn:start`.
  Any in-progress turn stores a **private** native control mapping in
  `omni_chat.codex_turn_sessions`, never returned to the user.
- `POST /v1/threads/:thread/turns/:turn/refresh` polls one claimed native
  turn; approval and cancellation use the existing Owner-bound routes
  and signed Gateway `approval` / `turn:cancel` RPCs.
- `GET /v1/threads/:thread/turns/active` returns one unfinished
  Owner-bound Chat turn ID/status to restore controls after browser reload,
  without exposing native Gateway handles.
- `GET /v1/threads/:thread/events?cursor=N`, or `Last-Event-ID` if
  cursor is omitted, replays committed PostgreSQL SSE rows only from the
  authenticated Owner. UI reconnects from the last committed sequence.

## Safety invariants

- Native control claim, digest binding and pending-decision reservation are
  durable before Gateway RPC. No automatic retry after unknown provider or
  persistence outcome. Approvals in RESOLVING require explicit reconciliation.
- No browser-provided Owner ID, native session handle, Secret resource or
  native thread ID may control a different Owner's turn.
- New rollback rehearsal is waived by the Owner, not marked as performed.
- An ordinary candidate smoke without `[release-once]` is **NOT_RUN**
  for formal cutover, not a failed release nor permission to switch traffic.
- The technical promotion workflow still requires the positive exact-main
  release marker and readiness checks; it does not authorize live billable
  inference or BYOK automatically.

## Evidence as of 2026-10-11

- `infra/postgres/migrations/004_codex_live_turns.sql`: **live DB PASS**,
  exact execution SHA `fa39b5894d506510fdbf4210538f22f8b0db589e`,
  [GitHub Actions #38110699581](https://github.com/tommylin15/omniAgent/actions/runs/38110699581).
  Real readback confirms owner `omniagent_chat_app`, table
  `omni_chat.codex_turn_sessions`, FK, and RESOLVING constraint.
  No other logical databases were modified by the migration script.
- Runtime Owner authorization, Codex credentials, Gateway single-instance
  config and real signed provider turn are **NOT VERIFIED**.
- The metadata-only Owner inventory runs after *current-SHA signed smoke*:
  `.github/workflows/omniagent-p0-owner-runtime-readonly.yml`. It reports
  only model entitlement counts and presence flags; it never reads secret
  payloads or prints Owner UUIDs. Missing configuration is **BLOCKED**, never
  promoted to DONE merely because the inventory job returns success.
- Owner inference remains disabled until the credential source, exact
  entitlement, permitted model, provider cost boundary, and positive
  human authorization are verified. Do not create credentials in the repo,
  Chat messages or Artifact receipts.

## Owner authorized 3-turn live Codex trial (2026-10-11)

The Owner selected option A: **real Codex inference may use allowance or incur
charges, for their own verified Owner only, at most three native turns**.
This is an *authorization*, not a claim that credentials or billing are ready.

The hard cap is enforced transactionally by
`omni_chat.codex_trial_budgets` (migration 005). Every successful
QUEUED→RUNNING Codex claim atomically consumes one allowance **before**
Gateway/provider invocation. Failures and cancellations still consume the
allowance; no automatic refunds, resets or retries. Concurrent claims
cannot exceed three; missing/expired budget rows deny execution.
The migration itself grants zero users any turns. A valid budget row must
be enrolled once for the Owner UUID read from the *authenticated*
`GET /v1/me`, with `max_turns=3` and expiry within 24 hours of approval.
Never infer identity from GitHub usernames, emails, screenshots or a client
request body. Explicit Owner enrolment must be audited in the
`omniagent_chat` database. Do not change another Owner's grant.

Codex credential provisioning is a separate mandatory prerequisite:
verify an existing Owner-specific Secret Manager `auth.json` source
or have the Owner complete official Codex sign-in. Do not export credentials
to this chat, Drive documents, GitHub Secrets, logs or PRs. The current
candidate runtime inventory detected zero approved Owners,
`CODEX_OWNER_SECRETS` absent, dispatch disabled and signed route
unconfigured. No actual provider call has been made in this trial.

The Owner can use the model at most three times **in total**, across
browser reloads, threads and deployment revisions, not three times per
session or instance. Run a second Owner denial, PostgreSQL count readback,
streamed answer, approval/decline/cancel, and reconnect checks against
the same exact deployed SHA before reporting acceptance. A provider
cost cap cannot be asserted merely from turn count; actual billing
remains under the provider's account/quota rules.

## A1 shared Codex source — isolated and read-only (2026-10-11)

The Owner confirms that the existing
`projects/gen-lang-client-0593591102/secrets/omniagent-shared-codex-auth`
belongs to their own Codex/ChatGPT account. This authorizes using it as a
**read-only authentication source for no more than 3 native Codex turns**;
it does not authorize changing this Secret, destroying versions, logging its
payload, or expanding access to other Owners.

The Gateway's native `turn:start` path must resolve
`CODEX_CHAT_TRIAL_OWNER_SECRETS` (a distinct mapping, keyed by the Owner's
verified UUID from `GET /v1/me`). It performs `ManagedAuthStore.load()`
only, into a disposable sandbox with 0600 permissions, never
`persist()/destroy()`. The regular `CODEX_OWNER_SECRETS` login/logout
lifecycle is deliberately **not enabled** by this mapping. Grant the
Gateway execution service account **only**
`roles/secretmanager.secretAccessor` on this one existing Secret,
after verifying the exact GCP service-account identity; never add
Secret Manager version-editor permissions for this trial. The existing
Shared Codex service remains unaffected in Secret Manager.

Important: copying or reading OAuth refresh credentials in two running
sessions can cause provider-side refresh conflicts even if GCP Secret
versions are not changed. Verify existing Shared Codex behavior before
and after the bounded trial, and stop if a refresh/re-auth error appears.
The shared credential's integrity is not demonstrated by a successful
read-only IAM check alone.

Owner identity must come from a real logged-in Chat browser. Chat's
authenticated `GET /v1/me` returns the DB-backed Owner UUID; the UI offers
"複製 Owner ID" only after that endpoint succeeds. No guessed UUID, personal
email or GitHub account can substitute. The user need only supply their
Owner UUID once; do not request an ID token, API key, raw `auth.json`,
Google password or session cookie.

Current status of A1 **before authenticated Owner ID is supplied**:
CODEX trial source approved by user; actual Owner mapping, IAM grant,
provider session and 3 real turn readback are **NOT VERIFIED**. Trial usage
remains **0/3** because no real turn was started.

## 2026-10-11 A1 approved limited live trial staging

The actual Owner UUID supplied from authenticated `GET /v1/me` is
verified against one OAuth-backed row in the production `omniagent_chat`
database without committing that UUID to Git. Source hash and metadata-only
readback are checked in CI. Evidence:
[Owner match / Secret IAM readback #38128959854](https://github.com/tommylin15/omniAgent/actions/runs/38128959854).
The user personally granted the narrowly scoped
`roles/secretmanager.secretAccessor` binding on
`omniagent-shared-codex-auth` for the
`omniagent-gateway@` runtime account; this now reads back as
`VERIFIED_DIRECT_ACCESSOR`. This **does not** assert the provider token
is still usable or that any inference has occurred.

User authorization: one authenticated Owner; **no more than three
attempted native Codex turns**. CI preflights OAuth DB identity and exact
Secret IAM, then creates a 12-hour trial budget row **without ever
resetting consumed turns**. A one-time, current-SHA
`[p0-trial-once]` gated workflow
(`.github/workflows/omniagent-p0-owner-trial-staging.yml`) creates
zero-traffic tagged Gateway and Chat revisions for that one Owner and
Codex model `gpt-5.6-luna`; no public site promotion, no
BYOK, no Secret version changes. Existing production serving allocation
is snapshotted and read back unchanged. Immediately after setting up
the two tagged revisions, the normal service templates are restored
to **disabled dispatch**, preventing future GitHub candidates from
inheriting the live-trial setting.

The staged tag is intentionally reachable to the authenticated Owner
only through normal Google sign-in. The gateway remains Cloud Run IAM
private and HMAC-signed. An anonymous request cannot consume a turn.
Staging is **NOT the same as provider live acceptance**. Do not count
a staging/workflow PASS as a billed Codex turn, nor count a model
response unless PostgreSQL event/readback evidence proves it.

When complete, remove the trial tags and any temporary configuration
and read back Owner budget, active traffic, Secret version state,
and the Shared Codex service's health. Never run provider requests
to exhaustion just to reach three; three is a maximum.

## One consolidated acceptance

- Same-SHA Node/PG integration, Flutter analyze/test/build and signed
  Gateway/Codex fixture tests: **CI PENDING until run verified**.
- New GHCR images → 0%-traffic candidate → signed smoke and backend
  401/403/health: **NOT VERIFIED for this commit until deployment**.
- Real approved Owner model turn → durable text deltas → native approval,
  decline, cancellation and SSE reconnect → Owner B denial → UI readback:
  **NOT VERIFIED**; requires approved Owner credentials and bounded permission.
- Formal promotion and latest-ten retention: only after separately
  approved release scope, exact current SHA checks, and cutover readback.

This document covers only omniAgent. Legacy WBS status rows represent
historical checkpoints, not current runtime evidence.


### 2026-10-11 Owner A browser report and independent evidence gate

- The Owner reports Google login and an actual Codex reply on the scoped
  zero-traffic staging tag. This is **operator-observed A positive**, not a
  PostgreSQL readback, approval/cancel/reconnect, or authenticated B denial.
- A one-time `[p0-evidence-once]` read-only audit verifies one OAuth-backed
  Owner, consumed trial budget, completed Codex turns since the staging
  checkpoint (2026-10-11 12:55 UTC), nonempty persisted text/terminal events,
  and owner-keyed relational integrity in only the `omniagent_chat` database.
- It outputs status keys only: no prompts, responses, Owner UUIDs, native IDs,
  credentials, or database mutation. An authenticated Owner B negative test is
  separate: physical relational links cannot prove browser authorization.
- Production promotion is a separate authorization and runtime gate. The
  existing code-only GHCR release **keeps dispatch and BYOK disabled**; even a
  successful traffic change must not be called live production Codex acceptance.


### 2026-10-11 post-Owner-A audit checkpoint — not yet accepted

- GitHub read-only evidence run #38152820347: canonical `omniagent_chat`
  Owner identity and owner-keyed referential integrity PASS, trial budget
  consumed 0/3, fresh Owner threads 0 and turns 0 after original trial staging.
- User-observed live reply and database output **do not yet reconcile**.
  Cloud Run trial route still exists as a 0% tagged candidate. Cloud Logging
  request-metadata read was unavailable with current CI identity; never
  interpret this as zero HTTP calls.
- Do not promote this to production application DONE, claim an authenticated
  second Owner denial, or reset/extend the trial. Next evidence: browser's
  actual trial URL/API request target → new Owner thread/turn readback →
  terminal and text events → separate Owner B negative → authorized release.
- No production traffic or Secret version was changed by these audits.

## 2026-10-13 P0-V Gemini Chat canary stage

Code cap: signed HMAC Gemini Chat route now limits `maxOutputTokens=512`, times out after 60s and refuses blank replies, without enabling Codex/BYOK. Node / GHCR quality PASS; [source commit b38a96b4](https://github.com/tommylin15/omniAgent/commit/b38a96b42de4fdb50f7ae624323860ab43b7ef99).

[Zero-traffic Chat owner stage #38365294643](https://github.com/tommylin15/omniAgent/actions/runs/38365294643) PASS: a single OAuth-backed Owner was matched from `omniagent_chat` via approved digest, Gemini-only entitlement deployed to a tagged private 0%-traffic Chat candidate, readback of Chat /health,/ready,/main.dart.js = 200 and anonymous /v1/models,/v1/threads = 401. Gateway 0% candidate was verified, Chat service template restored to dispatch OFF, and serving 100% revision preserved. This staged Gemini authorization is **not** user-facing Chat inference proof: no authenticated user ID token, real Chat Gateway dispatch, PostgreSQL new terminal event, SSE/receipt or Flutter message acceptance was performed. Under current policy real user OAuth automation is unavailable; human OAuth validation is NOT_REQUIRED, not PASS.

Do not promote Dispatch based on canary health. Missing live evidence remains OPEN/NOT_VERIFIED. All three service-identity Gemini probes from the earlier shared Gateway are independent of this Owner-scoped Chat path.
