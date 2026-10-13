## 2026-10-13 — market-mart-only 2,048-token output cap, bounded upgrade

- Owner approved raising the shared Gemini Gateway output budget from 512 to **2,048 maxOutputTokens only for authenticated `project=market-mart`**. This is a request cap, **not** guaranteed consumption; 2,048 is a conservative first step, not evidence that a full multi-role CEO JSON will fit.
- `omniagent` and `life-assistant` remain at 512 output tokens. The budget is derived from the authenticated, caller-matched project; a forged project claim is denied before model execution. No change to the approved Flash-Lite model, Gemini API key, 32 KiB market-mart input, 8 KiB other input, 128 KiB JSON envelope, 60-second timeout, concurrency 2 or non-retry fail-closed behavior.
- Truncation guard is retained: Gemini `finishReason=MAX_TOKENS` returns `502 gemini_execution_failed` with safe `reason=output_limit`; incomplete JSON must **not** be accepted or published by the market-mart consumer. No automatic retry, CEO schema relaxation or DB-write changes.
- **Release gates:** exact-SHA unit tests, GHCR, 0%-traffic private Gateway candidate and signed readback, followed by one original CEO Prompt request from the market-mart backend and its pre-existing schema/DB verification. Do not claim DONE solely on the basis of changing this integer.

## 2026-10-13 — market-mart CEO 502 diagnostic candidate deployed, true original-prompt cause OPEN

- **Known symptom:** owner reported market-mart original full CEO request reached private omniAgent Gateway but received HTTP `502 gemini_execution_failed`. Earlier synthetic 29,987 B UTF-8 prompt had passed a full live Gemini call; source now supports the necessary 32 KiB decoded market-mart input and 128 KiB escaped JSON.
- **Diagnostic code:** [SHA `bf6b3851ccea4316a2d07963d594921554340351`](https://github.com/tommylin15/omniAgent/commit/bf6b3851ccea4316a2d07963d594921554340351) safely classifies 502 reasons as `output_limit`, `safety_blocked`, `model_stopped`, `empty_model_reply`, `response_too_large`, `provider_rejected`, `provider_unavailable`, `provider_timeout`, `provider_network_error`, or `unexpected_failure`. Upstream HTTP non-quota errors and Gemini candidate `finishReason` / prompt `blockReason` are classified internally without returning raw provider text, secrets, owner info or the Prompt. A 512-token `MAX_TOKENS` result is now **rejected even with nonempty partial output**, to prevent an incomplete CEO JSON from being treated as successful.
- **Code/CI/GHCR/GCP gates:** [Node #38405060085](https://github.com/tommylin15/omniAgent/actions/runs/38405060085), [GHCR #38405059970](https://github.com/tommylin15/omniAgent/actions/runs/38405059970), [0%-traffic candidate #38405603787](https://github.com/tommylin15/omniAgent/actions/runs/38405603787), [signed candidate smoke #38405838851](https://github.com/tommylin15/omniAgent/actions/runs/38405838851), [exact diagnostic candidate config/readback #38406095316](https://github.com/tommylin15/omniAgent/actions/runs/38406095316) **PASS**. The diagnostic candidate is immutable, Ready, Gateway Gemini execution enabled on the zero-traffic Revision and guarded by the existing separate dedicated callers; no provider calls were made from diagnostic readback; formal Gateway serving allocation unchanged.
- **Verified diagnostic endpoint:** `https://ghcr-bf6b3851ccea---omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app/v1/gemini/execute`; ID-token **audience stays canonical** `https://omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app`. This endpoint is private, not a browser/web testing link.
- [ ] **Actual root cause still unresolved:** no access to the original failed candidate's raw provider `finishReason` or upstream status, and this deployment must **not** be misrepresented as a successful original CEO computation. market-mart's existing backend should make **one bounded original CEO request** to the diagnostic candidate, capturing only HTTP status, `error`, `reason`, random `requestId` and elapsed time. Keep its original JSON schema validation, fail-closed release and DB-write rules unchanged. If `reason=output_limit`, evaluate a market-mart-only output budget modification as a new bounded gate; do not silently raise output tokens, re-request, auto-publish or alter data. Other 502 reasons receive cause-specific triage.
- [ ] Formal Gemini-enabled Gateway traffic promotion remains independent and **not triggered** by the 0% canary. Life's separate technical handoff and Owner Chat acceptance remain unchanged.

## 2026-10-13 — market-mart CEO Gateway 502 investigation / diagnostic hardening

- **Observed consumer failure:** a complete market-mart CEO Prompt was accepted by the capacity-expanded Gateway but returned HTTP `502 gemini_execution_failed`. This **does not** contradict the earlier 29,987 B synthetic capacity real-provider PASS. The failing original prompt's provider `finishReason`, upstream HTTP status and duration are **not available yet**; definitive root cause remains `NOT_VERIFIED`.
- **Identified diagnosis gap:** `shared_gemini.ts` previously mapped all non-quota provider failures, 60s timeout and blank/non-usable responses to an indistinguishable `gemini_execution_failed`. Upstream API distinguishes `MAX_TOKENS`, `SAFETY` and other finish reasons; existing response budget is still **512 tokens**. Treat output-token exhaustion as a hypothesis until real request evidence confirms it.
- **Code change (bounded, backward compatible):** keep HTTP status, `error`, `requestId` and `status` contract, but for HTTP 502 add an allowlisted `reason` drawn from `output_limit`, `safety_blocked`, `model_stopped`, `empty_model_reply`, `response_too_large`, `provider_rejected`, `provider_unavailable`, `provider_timeout`, `provider_network_error`, `unexpected_failure`. Reject `MAX_TOKENS` even if the candidate text is nonempty, so an incomplete CEO JSON cannot be passed as `completed`. Keep provider exceptions, prompts, tokens, safety ratings and raw model output hidden. Safe structured audit logs carry only failure reason, upstream HTTP status, random requestId, input byte count and duration.
- **Conserved restrictions:** no changes to caller IAM/project binding, 32 KiB market-mart input, 8 KiB other prompts, 128 KiB JSON envelope, 512-token output, one provider call, zero retry, 60-second timeout, no DB write, no Chat/Life feature expansion or automatic formal traffic switching.
- **Remaining acceptance:** exact-SHA Node tests → GHCR → 0% Cloud Run → original market-mart full CEO request **once** through the new candidate, capture only `reason` and its caller-side terminal contract. If `output_limit`, separately review a market-mart-only 2,048-token cap and actual validated CEO output before allowing any model-driven write. Do not claim a complete five-role CEO report from a 200 text response alone.

## 2026-10-13 — market-mart full CEO Prompt Gateway capacity: candidate LIVE PASS, consumer integration still separate

- **Root cause fixed:** original `/v1/gemini/execute` rejected request-body payloads over 12,000 B and UTF-8 prompts over 8,192 B, below the market-mart complete CEO sample of **29,987 UTF-8 bytes**. Source now accepts **32,768 B decoded UTF-8 Prompt for `market-mart` only**, preserves **8,192 B** for `life-assistant` and `omniagent`, and permits **131,072 B JSON envelope** for Python `ensure_ascii=True` CJK escapes. Upstream Gemini Provider still enforces max 32,768 UTF-16 characters, so there is no uncapped alternate path.
- **Immutable code/build/deploy evidence:** SHA `965b05542a35631feb1e663e1a2a58cf1bd92198` passed [Node Core #38388184457](https://github.com/tommylin15/omniAgent/actions/runs/38388184457), [GHCR all-image publish #38388184822](https://github.com/tommylin15/omniAgent/actions/runs/38388184822), [0% candidate #38388704601](https://github.com/tommylin15/omniAgent/actions/runs/38388704601), and [signed smoke #38388876984](https://github.com/tommylin15/omniAgent/actions/runs/38388876984).
- **Live, bounded original Gateway route acceptance:** [market-mart 32 KiB live candidate #38389324047](https://github.com/tommylin15/omniAgent/actions/runs/38389324047) **PASS**; [hygiene-corrected repeat #38389373782](https://github.com/tommylin15/omniAgent/actions/runs/38389373782) also **PASS**. Dedicated `market-mart` SA IAM/Google ID-token authenticated against zero-traffic candidate `https://ghcr-965b05542a35---omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app`; canonical ID-token audience is `https://omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app`. Each live job performed exactly **one** real Gemini Flash-Lite `generateContent` call with a synthetic **29,987 B UTF-8 CJK Prompt**, serialized using Python-default JSON into **60,150 B on wire**, and received 200/COMPLETED with a nonempty model reply and matching request ID. Across the two successful smoke workflow runs, there were **two bounded real provider calls total**; no cost estimate is inferred.
- **Negative and safety results (both runs):** market-mart 32 KiB+1-byte Prompt and Life 8 KiB+1-byte Prompt returned HTTP 400 `invalid_request` before inference; private Gateway service account IAM, distinct project binding and Flash-Lite entitlement were checked. Formal Gateway traffic remained unchanged across the smoke workflow, and tagged candidate remained at **0%**. No consumer repo, key, DB, schema, Chat UI or Life feature changed.
- [x] **omniAgent Gateway input-capacity blocker for the 29,987 B market-mart CEO request is resolved on the verified candidate URL.**
- [ ] **Separate remaining consumer acceptance:** run the *original complete* market-mart CEO Prompt from its existing backend using its dedicated identity and the 0%-traffic candidate URL, then verify the caller's requestId/model/result contract, complete CEO JSON schema, and existing database write/validation constraints. A synthetic 29,987 B input SUCCESS does **not** prove model-quality, five-Specialist logic or valid CEO JSON. The response remains capped at **512 generated tokens**, which could independently truncate a complex CEO JSON output. Do not auto-expand output or billable inference/retries without separate evidence and approval.
- [ ] **Formal rollout:** do not infer production Gateway adoption from a 0%-candidate tag or no-op formal release workflow. Gateway serving traffic/image/config and each consumer's authorized release must be independently verified before claiming final public deployment.

## 2026-10-13 — market-mart full CEO prompt capacity fix (code-only, release evidence pending)

- Problem: market-mart needs an approximately **29,987-byte** complete five-role CEO Prompt; Gateway previously rejected UTF-8 input above **8,192 bytes** and HTTP JSON body above **12,000 bytes**. The shared Gemini Provider also enforces 32,768 UTF-16 characters; simply raising the HTTP body cap alone would not unblock the CEO request.
- Resolution in `services/agent-gateway/shared_gemini.ts`: **market-mart only** may submit up to **32,768 UTF-8 bytes (32 KiB)** of prompt; `omniagent` and `life-assistant` stay at **8,192 bytes (8 KiB)**. The overall JSON request body cap is **49,152 bytes (48 KiB)**, allowing UTF-8 metadata and normal JSON escaping. Requests beyond either limit fail closed with `invalid_request` 400 before provider execution.
- Capacity test: genuine 29,987-byte UTF-8 text sent over the local HTTP handler fixture, with a stubbed Gemini invocation, must succeed once. Verify 32 KiB boundary; reject a 32 KiB+1-byte CEO prompt, oversized multibyte input, oversized escaped JSON envelope, and any 8 KiB+1-byte Life/omniagent prompt.
- No change to Gateway IAM/caller identity, rate/concurrency 2, single provider invocation, 60-second timeout, 512 output tokens, approved Flash-Lite model, no retries, no additional platform feature, DB writes or public exposure. Input **bytes are not tokens**; an actual provider response, consumer JSON validation and GCP staging acceptance are independent gates. This does **not** certify full five-specialist CEO analysis model quality.

## 2026-10-13 — Life P0-V technical integration handoff (consumer-reported DONE)

- **Life Assistant project report:** P0-V technical connection is **DONE on the Life side**. The agreed scope is the existing Life backend/service identity → private omniAgent Gateway → Gemini Flash-Lite → validated response returned to the existing Life application workflow. This is **not** a requirement to add a user-facing chat page, conversation UI, or any new unplanned Life product feature.
- **Evidence separation:** this handoff status is **reported by the Life project via the Owner**, not a new independent verification of Life's repository, CI, runtime logs, or application data from within the omniAgent project. omniAgent previously verified the dedicated Life service identity via its bounded Gateway Gemini pilot ([#38357794169](https://github.com/tommylin15/omniAgent/actions/runs/38357794169)); that CI impersonation alone does not prove the separate Life runtime. Do not mislabel this project report as a fresh omniAgent G3 runtime readback.
- **Acceptance boundary:** preserve all existing user consent, data authorization, context restrictions and backend validation/write rules. No new UI requirement, no artificial OAuth manual acceptance, no broad production traffic promotion, no extra provider calls and no changes to the Life repository as part of this handoff.
- **Next:** record Life-side technical completion as `REPORTED_DONE`, keep independent omniAgent-side consumer-runtime provenance `NOT_INDEPENDENTLY_VERIFIED_HERE`, and continue tracking market-mart separately. P0-V engineering technical completion is not identical to formal multi-consumer public launch.

# Shared Gemini vertical slice — Chat / market-mart / Life

> Priority decision: 2026-10-13. **SCOPE: one request and one response per consumer.**
> This document describes omniAgent-owned Gateway implementation only. It does
> not claim or modify the market-mart / Life repositories or their business workflows.

## Smallest supported route

```
Authenticated Flutter Chat -> omniAgent Chat API -> private Agent Gateway -> Gemini
market-mart backend/job (dedicated SA) ------^                           |
Life backend (life-assistant SA) --------^                           v
                                     JSON text response to the original caller
```

The Gateway already has Gemini Provider code. This slice adds one **private**
`POST /v1/gemini/execute` endpoint to reuse that provider from signed service
callers; the existing Chat-to-Gateway internal signed dispatch route remains
separate and **OFF in production** until owner Entitlements and its own live
persistence gate pass. This new endpoint is not directly callable from a browser.

**Minimum contract:**

```json
{"project":"market-mart","ownerId":"00000000-0000-4000-8000-000000000001",
 "requestId":"00000000-0000-4000-8000-000000000002",
 "prompt":"Reply briefly with an assessment of the supplied public facts.",
 "model":"gemini-3.5-flash-lite"}
```

Success (text only):

```json
{"status":"completed","project":"market-mart",
 "ownerId":"00000000-0000-4000-8000-000000000001",
 "requestId":"00000000-0000-4000-8000-000000000002",
 "model":"gemini-3.5-flash-lite","result":{"text":"..."}}
```

An optional `usage` contains reported Gemini token counts if the API returned
them; no estimated cost is invented. Errors are stable and secret-free
`unauthenticated` (401), `caller_project_mismatch` (403),
`invalid_request` (400), `gateway_busy` / `gemini_quota` (429), and
`gemini_execution_failed` (502). Disabled route responds 404.

## IAM and activation

By default `GEMINI_SHARED_EXECUTION_ENABLED` is **not true**, so the route
does not exist. All of these must be configured before **bounded real**
three-consumer acceptance; do not infer values from the repository:

- `GEMINI_SHARED_EXECUTION_ENABLED=true`;
- `GEMINI_SHARED_AUDIENCE` = the exact HTTPS private Gateway Cloud Run service
  audience (no tag URL; it is **not** a Chat user OAuth client ID);
- `GEMINI_SHARED_CALLERS_JSON` = exactly `omniagent`, `market-mart`,
  `life-assistant` mapped to **distinct** verified Google service account
  emails (existing dedicated identities are candidates, verify actual IAM);
- `GEMINI_API_KEY` provided by the existing approved
  `OMNIAGENT_PROVIDER_BUNDLE`, not copied to consumers;
- `GEMINI_SHARED_MODEL` optional, defaults to `gemini-3.5-flash-lite`,
  must be in the three-model Flash-Lite allowlist.

Cloud Run `roles/run.invoker` must be granted **only** to the verified
dedicated callers, not `allUsers`. Each consumer mints a Google ID token
with Gateway audience, sends `Authorization: Bearer <token>`, and binds its
server-authorized Owner UUID in the JSON. A claimed project field alone never
provides authorization. Do not put Gemini keys in market-mart, Life, Flutter or logs.

**Billing guard:** one non-retried Gemini `generateContent` request per
accepted invocation; at most two in-flight calls per Gateway instance;
8 KiB UTF-8 prompt for `omniagent` and `life-assistant`, **32 KiB UTF-8
prompt for `market-mart` CEO analysis only**, and a 128 KiB JSON HTTP envelope (covers Python-default escaped CJK text)
(all callers). One request still permits only 512 maximum generated tokens,
32K returned characters, and a 60s HTTP timeout. No grounding,
tools or background tasks. `GEMINI_PAID_ENABLED=true` fails closed. Actual
free quota and zero billing are **not** guaranteed by that environment flag:
confirm API project tier, quota and permission before setting enabled=true.

## Acceptance ledger (separate gates)

1. G0 **code gate:** Node build/unit security tests + exact-SHA CI.
2. G1 **Gateway deployment:** 0%-traffic signed candidate, enabled route
   configuration, image and private IAM readback (no formal traffic promotion
   from code-only evidence).
3. G2 **three actual callers:** real signed `omniagent`, `market-mart`,
   `life-assistant` requests each produce a non-empty Gemini response,
   with requestId matched on the consumer side and three negative cross-project
   tests. A test caller impersonating the service identity is NOT the same as
   a consumer backend implementation.
4. G3 **consumer application round-trip:** original Chat, market-mart, and Life
   user-facing/server-side operation consumes, validates and displays/persists
   the answer under its own business contract. This needs separately owned
   consumer repo changes and runtime evidence. market-mart CEO structured immutable
   JSON and Life Drive AI consent/caching are **not** replaced by text-only
   smoke responses.
5. G4 **controlled formal promotion:** after evidence from G1–G3; do not
   assert enabled Chat dispatch or BYOK from Gateway text route acceptance.

**Deferred** (NOT deleted): generalized BYOK, Groq, OpenRouter, full Codex,
complex Skills/MCP, GCS/Iceberg/BigLake, retries/queue/streaming/approval,
multi-owner full-scope scenarios and the previous P0 canonical DB incident.
Existing security requirements (IAM, request binding, no-secret logs) remain
minimum requirements and are never waived.

> Historical pilot checkpoint (before consumer handoffs): **Gateway G0/G1 and bounded CI-identity portion of G2 PASS; G3/G4 then OPEN**. Subsequent Chat Preview acceptance and Life-side project-reported technical completion are recorded above; independent omniAgent G3 runtime provenance for Life is still not in this repository. No formal Gemini-enabled production Gateway promotion is implied.

## 2026-10-13 verified Gemini 3-identity pilot

- Gateway image source: immutable public GHCR code SHA `b03e5f552659845a1ca0904fe2b3d36915ff2bbc`; Node Core / project hygiene / GHCR three-image publish PASS; normal GHCR 0% candidate and signed smoke PASS.
- Read-only GCP audit: [#38357097987](https://github.com/tommylin15/omniAgent/actions/runs/38357097987) PASS. Gateway private, Provider bundle reference configured, dedicated Chat, market-mart and life-assistant service accounts exist; narrow CI impersonation generated ID tokens for all three. Before pilot all three lacked Gateway invoker role.
- Scoped IAM deployment pilot: [#38357410764](https://github.com/tommylin15/omniAgent/actions/runs/38357410764) shows exactly three Gateway `roles/run.invoker` service-level grants and safe readback. The same run initially failed to normalize Cloud Run's OCI cache image URL; no pilot traffic was created at that attempt.
- **Successful zero-traffic pilot**: [#38357794169](https://github.com/tommylin15/omniAgent/actions/runs/38357794169) PASS. Cloud Run returned its cached `cache.us-docker.pkg.dev/ghcr.io/...` revision reference; the workflow accepted only that exact cached mirror and normalized to the immutable originating GHCR digest before deploy. Private `gemini-p0v-b03e5f55` tag created at **0%**. Original production serving revision retained 100%.
- On that genuine GCP candidate, IAMCredentials minted three distinct audience-bound ID tokens and each called Gemini Flash-Lite via the same Gateway; `omniagent`, `market-mart`, `life-assistant` each received 200/COMPLETED, echoed matching project/request IDs, approved model ID and nonempty response text. Anonymous caller and a mismatched project/identity both denied. **These are CI-controlled service-identity calls, not consumer application round-trips.**
- No secrets, user documents or model text written to logs; prompts were short non-personal smoke prompts. No BYOK/Chat dispatcher enabled; no GCS/Iceberg changes or formal traffic promotion. No provider billing tier or monetary cost was independently verified merely by response success.
- Next: consumer runtime permission/readback and app-level result handling under each project's separately approved repository. Chat's existing thread/turn path remains explicitly OFF; do not pretend the pilot proves live owner-account PostgreSQL persistence or that user-facing Chat works.

## Consumer implementation handoff (not a completed application)

All consumer applications must call from their **server**, not Flutter/Dart/web. Use Google IAM Credentials `generateIdToken` with `audience=https://omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app` and `includeEmail=true`, using their approved dedicated caller identity. Current Cloud Run service-level `run.invoker` rights for the three identities are present, but a consumer runtime's ability to impersonate its dedicated identity must be verified independently. CI's separate TokenCreator ability does **not** grant consumer runtimes impersonation. Use canonical Gateway service URL after independently approved formal promotion; the `gemini-p0v-b03e5f55` 0%-candidate URL is only for fenced runtime acceptance.

- `omniagent`: Chat API derives Owner UUID from verified Google user token; persists or returns the model result through the existing authorized Chat contract, not from browser-supplied ownerId.
- `market-mart`: caller preserves existing CEO immutable JSON schema, validated Specialist hashes and fail-closed publication logic; a successful raw text response is not automatically a valid CEO report.
- `life-assistant`: caller preserves documented user consent, bounded context, cache/fingerprint, structured output validation and backend-owned DB writes; activity exploration AI is a separate feature.
- Every caller validates `status`, `project`, `requestId`, `model`, and a nonempty bounded `result.text`. Reject errors; do not blindly retry after an uncertain execution. Do not copy Gemini provider API keys into consuming projects.

**Remaining gates:** [x] minimum owner-authorized Chat Preview UI / DB roundtrip (2026-10-13 user observation + DB proof, no automated user OAuth); [ ] market-mart original API/job roundtrip; [x] Life application technical integration **REPORTED_DONE by its own project**, with independent omniAgent-side Life runtime receipt `NOT_INDEPENDENTLY_VERIFIED_HERE`; [ ] remaining per-consumer identity/runtime and negative-case evidence not already documented as passed; [ ] controlled formal Gateway promotion and any separately authorized release. No human OAuth acceptance gate is reintroduced.

## 2026-10-13 omniAgent Chat signed-Dispatch follow-up

The existing Chat UI uses Owner-authorized `POST /v1/threads/:id/messages`, PostgreSQL ChatDispatcher, and the signed private Gateway `POST /internal/v1/assistant/turn`. This is **not** the dedicated `/v1/gemini/execute` identity pilot. Gateway's existing approved `OMNIAGENT_PROVIDER_BUNDLE` imports the provider key and HMAC secret. Positive Chat runtime Google ID token, Gateway IAM, matching signing key, real verified Owner UUID and Gemini-only entitlement are separately required.

Signed Chat Gateway Gemini requests now specify 512 maximum output tokens and 60-second deadline, and reject blank model output rather than persisting a false successful turn. Source and test hardening do **not** establish a real user OAuth, PostgreSQL event receipt or UI response. Never substitute a service-account token for a Google user OAuth token. No human OAuth acceptance requirement is reinstated.

## 2026-10-13 actual Chat Owner-scoped staging evidence (not live OAuth E2E)

- Signed source `b38a96b42de4fdb50f7ae624323860ab43b7ef99` hardened the existing HMAC-signed **Chat** Gateway Gemini branch with `maxOutputTokens=512`, 60s timeout and empty-response rejection. Node Core, Flutter, GHCR quality and unit tests PASS; these do not create a real user OAuth token.
- GHCR main release `1cb6542b178db026f8bb1714d71ae43c5721af25`: [public images PASS #38364416557](https://github.com/tommylin15/omniAgent/actions/runs/38364416557), [private Cloud Run 0%-candidate PASS #38364754380](https://github.com/tommylin15/omniAgent/actions/runs/38364754380), [signed candidate smoke PASS #38364920352](https://github.com/tommylin15/omniAgent/actions/runs/38364920352). A previous GHCR candidate verification failed because the same Cloud Run environment entries had changed **order only**; [redacted runtime comparison #38364224690](https://github.com/tommylin15/omniAgent/actions/runs/38364224690) confirmed all names+values, service identity and VPC match. CI now sorts by environment name and rejects duplicates, preserving all content/security comparisons.
- [One Owner Gemini-only Chat canary #38365294643](https://github.com/tommylin15/omniAgent/actions/runs/38365294643) **PASS**. The one approved Owner was independently matched to an OAuth-backed `omniagent_chat` DB owner by known digest (no UUID in source/logs). Exactly one Gemini-3.5-Flash-Lite entitlement was configured on private/tagged **0%** Chat revision `p0v-gemini-chat-1cb6542b`. Its real HTTP /health, /ready, /, /main.dart.js returned 200, anonymous /v1/models and /v1/threads returned 401. The deployment restored the Chat **service template** to Dispatch OFF after creating the tagged candidate. Formal Chat/Gateway traffic unchanged; no Gemini inference was triggered by this staging job.
- **NOT VERIFIED**: actual end-user Google OAuth HTTP request to Chat candidate, persisted authenticated Chat turn, HMAC route invocation originating from Chat, Gateway Gemini response persisted/replayed as Owner SSE, and Flutter UI receipt. Existing CI uses signed **service-account** identities; such a token is not a real Google **user** token. `real_user_google_oauth_e2e=NOT_VERIFIED_AUTOMATION_UNAVAILABLE`. The user explicitly removed human OAuth acceptance: do not reintroduce it as a release gate or misstate it as PASS. Production `CHAT_DISPATCH_ENABLED` remains OFF.
- Consumer runtime round trips and formal production Gateway activation also remain OPEN, independently of the three CI impersonated service-account Gemini successful responses.

## Fixed omniAgent Chat Preview alias (2026-10-13)

An already existing stable `preview` hostname was found pointing at a historical non-Gemini-enabled Chat revision. [Action #38371491983](https://github.com/tommylin15/omniAgent/actions/runs/38371491983) re-bound only the Preview tag to the single-Owner Gemini-only, already Ready 0%-traffic Chat canary `omniagent-chat-00077-xas`. The stable Chat testing URL is `https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app/`, and will not need a new URL for each bounded candidate. Its health, Flutter static asset, private/protected route denial and unchanged production traffic received real GCP/HTTP readback PASS; Google login, model answer, owner DB receipt and user display have **not** yet passed. Future auto publication is still opt-in; do not infer that fixed Preview will automatically track new main.

## 2026-10-13 18:12 TPE — Owner Chat Gemini DB-backed roundtrip readback

- [x] Owner operator reports that the fixed Preview now allows creating a thread and rendered a Gemini response. This is **user-observed**, not independent server-side UI automation.
- [x] **DB persistence is independently verified, not inferred from the left-hand chat history**: [GitHub Actions #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212) PASS. GCP CI selected the single approved OAuth-backed Owner via digest, queried only its own `omniagent_chat` PostgreSQL records created after 2026-10-13 09:11 UTC for `gemini-3.5-flash-lite`, and counted 3 threads, 1 turn, 1 COMPLETED turn, 1 persisted nonblank `text_delta`, 1 `turn_completed` terminal event, and 1 **durable completed** result. No prompts, responses, IDs, credentials or other databases were emitted; SQL transaction READ ONLY and ROLLBACK verified. These bounded DB facts are consistent with the human report but cannot, absent a request-ID join, prove exact message-to-row identity independently.
- [ ] **Only Owner UI reload proof remains in this particular Chat interaction**: refresh the Preview page, select the previous thread on the left, and verify the Gemini answer itself is visible; the UI may or may not display the explicit `PostgreSQL 已確認回覆持久化` badge after reload (the badge is request-local). Neither left-sidebar thread existence nor a user-visible provider reply alone substitutes for the independent DB evidence.
- [ ] Historical root cause of earlier transient failed create-thread HTTP request remains `UNIDENTIFIED` because CI Cloud Logging read access was unavailable. Later Owner create-thread success is verified by operator report and new database thread count; do not claim a specific bug cause was proved.
- [ ] Formal production Chat dispatch stays OFF; Preview remains single approved Owner / Gemini Flash-Lite only. Other two consumer backend-native integrations remain independent acceptance gates.


## 2026-10-13 — P0-V omniAgent Owner Chat minimum vertical roundtrip ACCEPTED (Preview only)

- [x] **Actual approved Owner UI observation:** successfully created an omniAgent Chat conversation, sent the one-message Gemini Flash-Lite test, received the expected textual response, refreshed the browser, reselected the existing history thread and **confirmed the same assistant reply remains visible**. The browser/refresh is **Owner-reported acceptance evidence**; it is not a CI-simulated OAuth/user browser session.
- [x] **Independent bounded PostgreSQL evidence:** [Owner durable turn readback #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212) queried the *same approved OAuth-backed Owner* and `gemini-3.5-flash-lite` after the Preview deployment: 3 threads, 1 turn, 1 COMPLETED, 1 nonblank persisted `text_delta`, 1 `turn_completed`, **1 durable completed turn**. DB SQL used READ ONLY + ROLLBACK; no prompt, response, user IDs, Secret or OAuth token was logged. Counts corroborate the observed single successful roundtrip, but a strict per-request trace-ID join was not obtained.
- [x] **Technical acceptance boundary:** the scoped `Chat UI → Chat API/Owner authorization → signed private Gateway → Gemini Flash-Lite → omniAgent PostgreSQL → reloaded Chat UI` **minimum text path is PASS for one real Owner test in fixed Preview**, based on the combination of operator-observed reply/reload, bounded persistence readback, and previously verified canary/signed route infrastructure. It does **not** mean an independently instrumented HTTP trace covered every hop, or that OAuth browser automation passed.
- [ ] **Outside this acceptance:** production `CHAT_DISPATCH_ENABLED` remains OFF; no formal model-enabled traffic promotion, no broad multi-user access, no cross-Owner *live* browser isolation, no additional provider models. The original earlier failed-create-request root cause is still not independently identified. The `market-mart` and `life-assistant` runtime integrations remain separate OPEN gates. Human OAuth login *acceptance requirement* remains NOT_REQUIRED; no new manual OAuth gate is added.

