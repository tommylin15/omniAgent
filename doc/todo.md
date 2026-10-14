## 2026-10-14 — production HTTP/IAM acceptance: actual runtime PASS; model-enabled rollout still OPEN

- [x] **Formal HTTP/authorization runtime acceptance**: [Actions #38499280946](https://github.com/tommylin15/omniAgent/actions/runs/38499280946) PASS using [source workflow `omniagent-p0v-formal-auth-smoke.yml`](https://github.com/tommylin15/omniAgent/blob/main/.github/workflows/omniagent-p0v-formal-auth-smoke.yml). Read exact real Cloud Run 100%-serving URLs for Chat, Gateway and Shared Codex. Chat `/health` and `/ready` returned HTTP 200, anonymous Chat `/v1/models` and `/v1/threads` returned 401, anonymous Gateway and Shared `/health` returned 403. Dedicated `market-mart` service account's signed Google ID token accessed formal Gateway `/health` successfully, but malformed `/v1/gemini/execute` input returned HTTP 404 because formal Gateway shared Gemini execution is **not enabled**. Thus an authenticated IAM connection is not evidence that real production Gemini generation is available.
- [x] **No operational side effects:** this acceptance performed **zero** model inference calls, zero database writes, zero Cloud Run traffic mutations; live three-service 100% serving allocation unchanged. No browser OAuth login or cross-Owner tests were performed by this specific check.
- [ ] **P0-V model-enabled formal release** remains OPEN, independently of the three consumers' successful technical handoff reports and private 0%-traffic acceptance. Any production activation must preserve signed scoped caller-to-project identities, 2,048 market-mart vs 512 Chat/Life output caps, 32 KiB vs 8 KiB input caps, 503/429/504 failure taxonomy and no implicit paid retries. Require a post-promotion live positive and negative signed route acceptance as well as safe fallback. Production Chat Dispatch remains separately disabled until authorized.
- [ ] **Revision retention** remains PARTIAL: current counts 25/23/17 exceed the ten-per-service policy. Because several protected and candidate tagged URLs remain in use, release and current serving/fallback readback must precede any controlled tag retirement or revision deletion. No cleanup was attempted by these audit runs.

## 2026-10-14 — P0-V formal Cloud Run release INVENTORY PASS; broad live enablement NOT RELEASED

- **Source of truth:** [GCP read-only three-service runtime inventory #38498845455](https://github.com/tommylin15/omniAgent/actions/runs/38498845455), from workflow [`omniagent-p0v-formal-release-inventory.yml`](https://github.com/tommylin15/omniAgent/blob/main/.github/workflows/omniagent-p0v-formal-release-inventory.yml), ran against real Cloud Run services in `gen-lang-client-0593591102/us-central1`. It made **zero** Gemini calls, traffic/identity/Secret mutations, DB writes or revision deletions. This is a real runtime readback, not a successful-but-no-op `one-shot GHCR formal release` workflow: that workflow requires an explicit `[release-once]` commit message to actually promote.
- [x] **All three existing formal serving revisions are Ready, with exactly 100% traffic on one revision each**, authenticated Google Cloud service identities and pinned image digests: Chat `omniagent-chat-00069-tep` (`sha256:eeab8196eed3…`), Gateway `omniagent-agent-gateway-00060-vup` (`sha256:9c77697f083d…`), Shared Codex `omniagent-shared-codex-00046-naj` (`sha256:fc696d522f1c…`). These are the **formal serving** revisions at this audit instant; neither current `main` nor P0-V test tags can be assumed to be serving 100%.
- [x] **Cloud Run IAM boundary:** Gateway and Shared Codex have no `allUsers` or `allAuthenticatedUsers` invoker; Gateway retains the three dedicated Chat/market-mart/Life clients. Chat has a broad Cloud Run invoker binding for the public login/UI surface; that is **not** a bypass of Chat's separate OAuth authorization. Exact negative OAuth/Owner isolation and any other IAM grants are separate acceptance checks, not inferred from this audit.
- [ ] **P0-V Gemini-enabled general production NOT RELEASED:** formal Gateway serving revision `GEMINI_SHARED_EXECUTION_ENABLED=ABSENT` and `GEMINI_SHARED_MODEL=ABSENT`; private tagged `p0v-market2048-00d45861` is still **0% formal traffic**, intentionally serving only explicit tagged-URL calls. Formal Chat `CHAT_DISPATCH_ENABLED=false` and `CHAT_BYOK_MANAGEMENT_ENABLED=ABSENT`. A passing market-mart backend's tagged-URL CEO test is **not** the same as a production Gateway rollout. No new user/chat features are authorized by this technical handoff.
- [ ] **10-Revision retention NOT MET** at the inventory timestamp: Chat **25**, Gateway **23**, Shared Codex **17**. Existing `cloudrun_revision_retention.py` fails closed unless the designated promoted revision is the newest created/Ready, a verified rollback revision exists and no tagged URLs outside the retained ten are silently dropped. The current state has numerous 0%-traffic tagged previews/candidates; **no deletion, tag retirement, forced cleanup or rollback was attempted**. A separate read-only tag-by-tag usage/protection inventory and safe release plan must precede any destructive retention action.
- **Required next controlled gates:** (1) define exact production activation scope for the private Gateway/Gemini endpoints and consumer identities, without opening Gateway to the public; (2) approve/promote an immutable Gateway image and explicitly scoped `GEMINI_SHARED_*` config, with signed positive and negative consumer tests, no broad automatic retries, 2,048 only for market-mart and 512 for Life/Chat; (3) independently verify active traffic, identity, secret reference state, response and consumer routing after promotion; (4) keep Chat dispatch independently gated rather than enable it implicitly; (5) reconcile tagged Preview/Owner/market-mart URLs and retention after active-vs-fallback approval. Do not equate P0-V three-consumer `CONSUMER_REPORTED_PASS` with product-wide GA or model quality approval.
- **Current classification:** `P0V_TECHNICAL_HANDOFF=PASS_WITH_CONSUMER_REPORTS`; `THREE_SERVICE_PRODUCTION_BASELINE=RUNTIME_READBACK_PASS`; `P0V_MODEL_ENABLED_PRODUCTION=OPEN`; `REVISION_RETENTION_10=PARTIAL`; `FORMAL_RELEASE=PARTIAL`.

## 2026-10-14 — P0-V three-consumer technical handoff checkpoint (consumer-reported)

- [x] **omniAgent Owner Chat:** one real approved-Owner Gemini Flash-Lite response, independent durable PostgreSQL terminal receipt, and browser refresh/reopened historical reply were accepted earlier; owner/browser evidence and CI DB evidence remain separate. [DB receipt #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212).
- [x] **life-assistant:** consumer project previously reported `P0-V technical integration DONE`. The existing backend/service-to-Gateway path is the scope; adding a chat page or unrelated feature is explicitly *not* part of acceptance. Independent consumer runtime provenance remains recorded in the life-assistant project, not replicated or inferred from the omniAgent codebase.
- [x] **market-mart complete CEO technical roundtrip — `CONSUMER_REPORTED_PASS` (2026-10-14):** the Owner conveyed the separate consumer project's explicit result **"complete CEO technical roundtrip: PASS"** after using the omniAgent private Gateway integration. This report supersedes the older `OPEN` consumer-roundtrip statements below **as a handoff status**, not as independently ingested request/response/DB runtime evidence. The complete private CEO Prompt, payload, JSON/DB receipt, source CI run ID and release version have **not** been supplied to omniAgent in this handoff; do not fabricate them or claim exact per-request correlation.
- [x] **Gateway-side independently verified prerequisites:** market-mart-only 32 KiB UTF-8 Prompt and 128 KiB escaped JSON envelope; 2,048-output-token ceiling; fail-closed `MAX_TOKENS`; safe upstream 503 `provider_unavailable` / 429 quota / 504 timeout separation; one Gemini call and zero Gateway auto-retries. [Node #38487647737](https://github.com/tommylin15/omniAgent/actions/runs/38487647737), [GHCR #38487647861](https://github.com/tommylin15/omniAgent/actions/runs/38487647861), [0%-traffic deployment #38488025544](https://github.com/tommylin15/omniAgent/actions/runs/38488025544), [private Gemini-enabled Gateway #38488277144](https://github.com/tommylin15/omniAgent/actions/runs/38488277144), and [one short upstream-availability call #38488547115](https://github.com/tommylin15/omniAgent/actions/runs/38488547115) were PASS. The short inference is **not** a substitute for the separately reported full CEO technical acceptance.
- [ ] **Cross-project independent provenance (optional audit/readback gate):** record the original consumer's safe run/release ID, requestId, API terminal HTTP/status, complete JSON/schema validation and existing authorized business DB receipt when published by the owning project. Do not read the other project's private repository or database from omniAgent, or re-run a costly CEO inference solely to reconstruct evidence.
- [ ] **Separate release and operational gates:** current private/tagged 0%-traffic Gateway does not imply official Gateway production traffic promotion. Preserve private IAM, credential isolation, rate/budget bounds and per-consumer authorization. Review production serving revision/config, formal routing, rollback/runbook, negative-case/idempotency and consumer release independently before marking general availability. Owner Chat's normal production dispatch remains OFF until separately authorized. Technical path acceptance is **not** a blanket production DONE or model-quality signoff.

## 2026-10-14 — Gemini upstream 503 classification and availability: scoped Gateway acceptance

- [x] **Root behavior fixed:** before this change, a Gemini upstream HTTP 503 became a generic Gateway HTTP 502 `gemini_execution_failed`. Code [`8906efc0`](https://github.com/tommylin15/omniAgent/commit/8906efc0f5d8b2d1c2cd94ef248985c92ef3704e) now returns HTTP **503** with unchanged `error=gemini_execution_failed`, safe `reason=provider_unavailable`, `upstreamStatus=503`, `transient=true`. Gemini 500/502 retain 502 `provider_unavailable`; upstream 408/504 or local abort/timeouts map to 504 `provider_timeout`; network errors map to `provider_network_error`; invalid response JSON to `provider_invalid_response`; other upstream client errors to `provider_rejected`; 429 retains HTTP 429 `gemini_quota`. No raw provider exception/error body, tokens, key, private Prompt, text or safety details in client responses.
- [x] **No retries/no false success:** exactly one Gemini invocation per accepted Gateway request; `transient` is an operational hint only, not permission for automatic replay or publish. The existing 32 KiB `market-mart` Prompt, 128 KiB JSON envelope, 2,048 output-token cap, 60s timeout, concurrency 2, Flash-Lite allowlist and fail-closed `MAX_TOKENS`/schema behavior remain intact. Life and Chat retain the existing 8 KiB input and 512 output caps, and their independent acceptance status is unchanged.
- [x] **Unit tests and delivery CI:** [commit `00d45861`](https://github.com/tommylin15/omniAgent/commit/00d45861c78c60b005cab93a0a164804d555923e) extends error classification/no-retry tests. [Node Core #38487647737](https://github.com/tommylin15/omniAgent/actions/runs/38487647737), [GHCR #38487647861](https://github.com/tommylin15/omniAgent/actions/runs/38487647861), [zero-traffic Cloud Run #38488025544](https://github.com/tommylin15/omniAgent/actions/runs/38488025544), [signed candidate smoke #38488165430](https://github.com/tommylin15/omniAgent/actions/runs/38488165430) **PASS**.
- [x] **Real private market-mart Gemini-enabled candidate:** [#38488277144](https://github.com/tommylin15/omniAgent/actions/runs/38488277144) **PASS**. Private 0%-formal-traffic route `https://p0v-market2048-00d45861---omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app/v1/gemini/execute`, signed ID-token audience `https://omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app`. Immutable source/revision readiness and feature enablement checked; original Gateway service template restored, formal traffic unchanged; staged without inference.
- [x] **Actual upstream availability sample:** [one bounded live short-call #38488547115](https://github.com/tommylin15/omniAgent/actions/runs/38488547115) **PASS** at 2026-10-14 00:10 UTC: exactly **one** market-mart identity-authenticated, short non-CEO Prompt call to the private 0%-traffic candidate returned HTTP 200 with nonblank Gemini Flash-Lite result, canonical model/request reference and no formal traffic change. This proves availability at that instant only. Simulated upstream 503 errors were classified in unit tests; no real upstream 503 was observed during this bounded probe. A failed earlier workflow [#38488451512](https://github.com/tommylin15/omniAgent/actions/runs/38488451512) was a `GITHUB_ENV` step scoping issue fixed by [`5c432fa8`](https://github.com/tommylin15/omniAgent/commit/5c432fa87c78ce6180e0b84084263581b3f3c296), not a provider failure.
- [ ] **Still OPEN**: existing market-mart backend replay of the *original* complete five-role CEO Prompt against the new test endpoint, receipt of safe `reason` if failed, CEO JSON/schema/owner integrity/database write/consumer release acceptance. Do not mark end-to-end DONE or promote Gateway's formal traffic. Operational retries, if ever authorized, require consumer idempotency, bounded exponential backoff and separate paid-call approval; Gateway auto-retry remains **OFF**. Cloud Run `/health` and `/ready` are local app checks, **not** live model availability guarantees.

## 2026-10-13 — market-mart output cap 2,048, source/build/candidate LIVE PASS; original CEO contract remains OPEN

- **Source and scope:** [commit `227a0bdcbd7eea801470110ab8d55037bcecafee`](https://github.com/tommylin15/omniAgent/commit/227a0bdcbd7eea801470110ab8d55037bcecafee) sets the existing private shared-Gemini route output budget to **2,048 `maxOutputTokens` only for caller-bound `project=market-mart`**, preserving **512** for `omniagent` and `life-assistant`. A request cannot self-select the output cap; verified SA/project identity determines it. Existing Gemini Provider hard cap is 2,048. Existing `finishReason=MAX_TOKENS` fail-closed diagnosis is retained. This does **not** imply 2,048 tokens are always consumed or enough for full five-role CEO JSON.
- **CI evidence:** [Node Core #38408225773](https://github.com/tommylin15/omniAgent/actions/runs/38408225773), [Project Hygiene #38408225525](https://github.com/tommylin15/omniAgent/actions/runs/38408225525), [GHCR #38408225770](https://github.com/tommylin15/omniAgent/actions/runs/38408225770) **PASS**. The GHCR Chat publish needed a retry after a transient GitHub→Google Workload Identity network timeout; Gateway/Shared images had already passed. Gateway OCI image was independently checked for matching exact source SHA/digest.
- **Cloud Run zero-traffic deployment evidence:** [bounded market-mart 2048 pilot #38409577652](https://github.com/tommylin15/omniAgent/actions/runs/38409577652) **PASS**. Normal three-service candidate workflow [#38409132083](https://github.com/tommylin15/omniAgent/actions/runs/38409132083) failed after Chat succeeded because of concurrent main updates, so the dedicated pilot instead verified the immutable public GHCR Gateway OCI source label and digest, deployed only a **0%-traffic**, Gemini-enabled, private-market-mart pilot, checked Ready, and **restored the original Gateway service template image and all environment values**. Formal Gateway 100% serving traffic and all dedicated invoker IAM remained unchanged. Provider inference calls from this pilot = **zero**.
- **Approved market-mart endpoint:** `https://p0v-market2048-227a0bdc---omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app/v1/gemini/execute` using Google ID Token **audience** `https://omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app`. Endpoint remains private, 0% public/formal traffic, and intended for the existing `market-mart` SA-driven backend, not browser users. Input caps remain 32 KiB market-mart Prompt, 8 KiB Life/Chat, and 128 KiB HTTP JSON; 60s timeout, maximum concurrency 2, one inference per request and no retries are unchanged.
- [x] **Implementation → tests → CI GHCR → bounded Cloud Run candidate/config/runtime readiness passed.**
- [ ] **True business acceptance still OPEN:** original market-mart CEO Prompt, 2048-token result, full JSON schema/business validation, existing DB write/publication rules, per-request result semantics. An upstream 502 must still be diagnosed with safe `reason`; `MAX_TOKENS` or invalid CEO JSON must never be marked DONE or automatically published. No formal Gateway model-enabled traffic was promoted.

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
- Resolution in `services/agent-gateway/shared_gemini.ts`: **market-mart only** may submit up to **32,768 UTF-8 bytes (32 KiB)** of prompt; `omniagent` and `life-assistant` stay at **8,192 bytes (8 KiB)**. The overall JSON request body cap is **131,072 bytes (128 KiB)**, allowing UTF-8 metadata and Python-default `ensure_ascii=True` Unicode escaping. The 48 KiB draft was insufficient for a 29,987-byte CJK prompt encoded as ASCII `\\uXXXX` sequences. The decoded per-project prompt limit remains independent and strict. Requests beyond either limit fail closed with `invalid_request` 400 before provider execution.
- Capacity test: genuine 29,987-byte UTF-8 text sent over the local HTTP handler fixture, with a stubbed Gemini invocation, must succeed once. Verify 32 KiB boundary; reject a 32 KiB+1-byte CEO prompt, oversized multibyte input, oversized escaped JSON envelope, and any 8 KiB+1-byte Life/omniagent prompt.
- No change to Gateway IAM/caller identity, rate/concurrency 2, single provider invocation, 60-second timeout, 512 output tokens, approved Flash-Lite model, no retries, no additional platform feature, DB writes or public exposure. Input **bytes are not tokens**; an actual provider response, consumer JSON validation and GCP staging acceptance are independent gates. This does **not** certify full five-specialist CEO analysis model quality.

## 2026-10-13 — Life P0-V technical integration handoff (consumer-reported DONE)

- **Life Assistant project report:** P0-V technical connection is **DONE on the Life side**. The agreed scope is the existing Life backend/service identity → private omniAgent Gateway → Gemini Flash-Lite → validated response returned to the existing Life application workflow. This is **not** a requirement to add a user-facing chat page, conversation UI, or any new unplanned Life product feature.
- **Evidence separation:** this handoff status is **reported by the Life project via the Owner**, not a new independent verification of Life's repository, CI, runtime logs, or application data from within the omniAgent project. omniAgent previously verified the dedicated Life service identity via its bounded Gateway Gemini pilot ([#38357794169](https://github.com/tommylin15/omniAgent/actions/runs/38357794169)); that CI impersonation alone does not prove the separate Life runtime. Do not mislabel this project report as a fresh omniAgent G3 runtime readback.
- **Acceptance boundary:** preserve all existing user consent, data authorization, context restrictions and backend validation/write rules. No new UI requirement, no artificial OAuth manual acceptance, no broad production traffic promotion, no extra provider calls and no changes to the Life repository as part of this handoff.
- **Next:** record Life-side technical completion as `REPORTED_DONE`, keep independent omniAgent-side consumer-runtime provenance `NOT_INDEPENDENTLY_VERIFIED_HERE`, and continue tracking market-mart separately. P0-V engineering technical completion is not identical to formal multi-consumer public launch.

## 2026-10-13 — P0-V omniAgent Owner Chat minimum vertical roundtrip ACCEPTED (Preview only)

- [x] **Actual approved Owner UI observation:** successfully created an omniAgent Chat conversation, sent the one-message Gemini Flash-Lite test, received the expected textual response, refreshed the browser, reselected the existing history thread and **confirmed the same assistant reply remains visible**. The browser/refresh is **Owner-reported acceptance evidence**; it is not a CI-simulated OAuth/user browser session.
- [x] **Independent bounded PostgreSQL evidence:** [Owner durable turn readback #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212) queried the *same approved OAuth-backed Owner* and `gemini-3.5-flash-lite` after the Preview deployment: 3 threads, 1 turn, 1 COMPLETED, 1 nonblank persisted `text_delta`, 1 `turn_completed`, **1 durable completed turn**. DB SQL used READ ONLY + ROLLBACK; no prompt, response, user IDs, Secret or OAuth token was logged. Counts corroborate the observed single successful roundtrip, but a strict per-request trace-ID join was not obtained.
- [x] **Technical acceptance boundary:** the scoped `Chat UI → Chat API/Owner authorization → signed private Gateway → Gemini Flash-Lite → omniAgent PostgreSQL → reloaded Chat UI` **minimum text path is PASS for one real Owner test in fixed Preview**, based on the combination of operator-observed reply/reload, bounded persistence readback, and previously verified canary/signed route infrastructure. It does **not** mean an independently instrumented HTTP trace covered every hop, or that OAuth browser automation passed.
- [ ] **Outside this acceptance:** production `CHAT_DISPATCH_ENABLED` remains OFF; no formal model-enabled traffic promotion, no broad multi-user access, no cross-Owner *live* browser isolation, no additional provider models. The original earlier failed-create-request root cause is still not independently identified. The `market-mart` runtime gate remains OPEN; Life-side P0-V technical integration is REPORTED_DONE by the Life project but not independently revalidated here. Human OAuth login *acceptance requirement* remains NOT_REQUIRED; no new manual OAuth gate is added.

## 2026-10-13 18:12 TPE — Owner Chat Gemini DB-backed roundtrip readback

- [x] Owner operator reports that the fixed Preview now allows creating a thread and rendered a Gemini response. This is **user-observed**, not independent server-side UI automation.
- [x] **DB persistence is independently verified, not inferred from the left-hand chat history**: [GitHub Actions #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212) PASS. GCP CI selected the single approved OAuth-backed Owner via digest, queried only its own `omniagent_chat` PostgreSQL records created after 2026-10-13 09:11 UTC for `gemini-3.5-flash-lite`, and counted 3 threads, 1 turn, 1 COMPLETED turn, 1 persisted nonblank `text_delta`, 1 `turn_completed` terminal event, and 1 **durable completed** result. No prompts, responses, IDs, credentials or other databases were emitted; SQL transaction READ ONLY and ROLLBACK verified. These bounded DB facts are consistent with the human report but cannot, absent a request-ID join, prove exact message-to-row identity independently.
- [x] **Owner UI reload proof obtained (2026-10-13)**: refresh the Preview page, select the previous thread on the left, and verify the Gemini answer itself is visible; the UI may or may not display the explicit `PostgreSQL 已確認回覆持久化` badge after reload (the badge is request-local). Neither left-sidebar thread existence nor a user-visible provider reply alone substitutes for the independent DB evidence.
- [ ] Historical root cause of earlier transient failed create-thread HTTP request remains `UNIDENTIFIED` because CI Cloud Logging read access was unavailable. Later Owner create-thread success is verified by operator report and new database thread count; do not claim a specific bug cause was proved.
- [ ] Formal production Chat dispatch stays OFF; Preview remains single approved Owner / Gemini Flash-Lite only. market-mart remains an independent OPEN consumer gate; Life reported its own P0-V technical connection DONE (independent omniAgent consumer-runtime evidence not yet revalidated).

## 2026-10-13 P0-V Chat create-thread UI failure follow-up

- [x] Fixed Preview alias `https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app/` now points to `omniagent-chat-00081-gob` (the pinned Gemini-only single approved Owner test canary). [Safe Preview bind #38374482613](https://github.com/tommylin15/omniAgent/actions/runs/38374482613) PASS, formal traffic and other tags unchanged. Prior revision `00077-xas` was superseded only for Preview.
- [x] Flutter UI now displays sanitized HTTP response status and request trace on failed `POST /v1/threads`; after a successful POST, a separate thread-selection error no longer falsely reports that creation failed. [Source `9aac67574f585af0d166e2dd823c442c15402c0d`](https://github.com/tommylin15/omniAgent/commit/9aac67574f585af0d166e2dd823c442c15402c0d); Flutter tests, complete GHCR, private 0%-candidate and signed smoke PASS [#38373409149](https://github.com/tommylin15/omniAgent/actions/runs/38373409149), [#38373953746](https://github.com/tommylin15/omniAgent/actions/runs/38373953746), [#38374120107](https://github.com/tommylin15/omniAgent/actions/runs/38374120107).
- [x] Direct owner-schema `omni_chat.threads` INSERT inside a DB transaction succeeded with a verified ROLLBACK, probe row count 0 and **zero newly created threads during the preceding 90 minutes** at readback. [#38373089607](https://github.com/tommylin15/omniAgent/actions/runs/38373089607) PASS. Does not prove that a human browser POST reached the API.
- [ ] **Still OPEN**: true cause of reported browser "unable to create thread"; GitHub CI service account's Cloud Logging read permission was unavailable ([#38372465093](https://github.com/tommylin15/omniAgent/actions/runs/38372465093)), so no genuine request status/trace was available in this session. User must retry **one** create-thread click on refreshed fixed Preview and report only the sanitized new UI error/status/request ID, or report actual creation success. Do not send OAuth bearer token or personal email.
- [x] **Preview Owner minimum live text roundtrip accepted**: authenticated Chat owner reported Gemini response/reload; separate DB confirmed the one terminal Gemini turn. See acceptance checkpoint above. Automated browser OAuth and exact per-request hop correlation remain NOT_VERIFIED.  Service-account Gemini pilot PASS does not establish this.

## 2026-10-13 P0-V fixed Chat Preview — RUNTIME PASS, user-model reply OPEN

- [x] The permanent test URL `https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app/` exists and was migrated **only by 0%-traffic tag update** from historical Chat revision `omniagent-chat-00039-rik` to approved one-Owner Gemini-only Chat canary `omniagent-chat-00077-xas`.
- [x] [Guarded Actions #38371491983](https://github.com/tommylin15/omniAgent/actions/runs/38371491983): verified signed Gateway URL/audience, one hashed OAuth-backed Owner + sole `gemini-3.5-flash-lite` entitlement, immutable image, candidate Ready, old Preview healthy, new Preview /health /ready /main.dart.js HTTP 200 and unauthenticated /v1/models /v1/threads 401. **Other tags and formal 100% traffic were unchanged.**
- [ ] This fixed Preview is **not** proof of a Google user sign-in, real Gemini response persisted to PostgreSQL or UI. The account must match the single approved Owner; OAuth authorized-JavaScript-origin remains NOT_VERIFIED_AUTOMATION_UNAVAILABLE. Do not interpret an unentitled user or disabled Create button as general Chat release readiness.
- [ ] Future releases must continue using the guarded fixed preview route and cannot silently overwrite the fixed alias or formal deployment. `OMNIAGENT_AUTO_PREVIEW_ENABLED` remains opt-in; this one-time tag update does not change that flag.

# 2026-10-13 Owner reprioritization — single vertical Gemini round trip

**Priority P0-V: Chat / market-mart / Life backend → omniAgent Gateway → Gemini API → the originating application.** Deliver three bounded, real end-to-end text request/response paths first. This does **not** reopen old human OAuth verification or turn on paid provider execution without explicit configuration/quota approval.

- [x] Gateway minimum text endpoint and signed three-project service identity boundary source: `services/agent-gateway/shared_gemini.ts` (OFF by default); no consumer secrets, browser access or cross-project credential reuse.
- [x] Node Core / Hygiene / three-image GHCR CI, 0% candidate and signed smoke PASS (source `b03e5f55`).
- [x] Three service-level Gateway invoker grants, IAM readback, one real Gemini response for each of the **three CI-impersonated caller identities**, negative anonymous/project spoof, and enabled Gateway **0%-traffic** pilot PASS ([#38357794169](https://github.com/tommylin15/omniAgent/actions/runs/38357794169)).
- [x] App-level **Owner-scoped Preview** Chat → signed Gateway → Gemini → PostgreSQL/UI minimal text path accepted from user-visible one-turn result and independent DB terminal persistence ([#38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212)); production Chat dispatcher remains OFF.
- [x] Chat signed Gateway Gemini branch source hardening: 512 generated-token limit, 60s timeout, blank-answer failure and regression fixture. Exact-SHA CI/deployment remains separate.
- [x] **Scoped Chat 0% Gemini-only canary stage PASS**: one hashed/OAuth-backed DB Owner verified, private Gateway candidate selected, tagged Chat revision created, Chat service template restored to Dispatch OFF, /health /ready /main.dart.js 200, anonymous /v1/models and /v1/threads 401. [Actions #38365294643](https://github.com/tommylin15/omniAgent/actions/runs/38365294643), source image `1cb6542b`; no paid Gemini call from this stage.
- [x] **Owner Chat Preview minimum text/DB/UI acceptance PASS**: real Owner-reported new thread, provider answer and browser-reloaded historical answer + one independently verified durable Gemini COMPLETED DB turn. Browser OAuth *automation* and exact HTTP request-ID correlation remain NOT_VERIFIED_AUTOMATION_UNAVAILABLE, not claimed PASS. Formal production model dispatch remains OFF.
- [ ] Independent market-mart consumer runtime/API result handling remains OPEN; no changes to that separately owned repository.
- [x] **Life-side P0-V technical integration: REPORTED_DONE** by the separate Life project; no new chat UI/feature required. This is a handoff report, **not** an independently retrieved Life runtime receipt in this omniAgent repository. No Life repo changes.
- [ ] Actual three consumer runtime identities (distinct from CI impersonation), failure handling and controlled formal Gateway promotion remain OPEN.
- [ ] The old P0 Owner PostgreSQL mismatch, advanced replay/cancel, BYOK, Groq, GCS/Iceberg/BigQuery and exhaustive product gates remain OPEN in their original sections; defer them from **this slice's** scope, do not misreport them as DONE.
- See [single vertical Gemini contract](../docs/shared-gemini-vertical-slice.md).

# 2026-10-10 Owner change: single integration / promotion / cleanup; rollback drill waived

### 2026-10-12 — P0 Owner Chat 1→3 accepted scope and remaining gates

- [x] **1 / Read-only historical evidence:** canonical Owner A DB 0/3 consumed, no new threads/turns, original trial tag still present (#38204839509). Logging/browser-origin evidence unavailable; **root cause remains UNDETERMINED**, do not fabricate closure.
- [x] **1 / Forward instrumentation:** random response request ID, served Revision header, sanitized DB-commit/dispatch/reconciliation/SSE stage logging. The current session UI shows the request ID and clears it on account/thread switch. Real runtime header PASS (#38206616628).
- [x] **2 / Automated, nonbillable A/B tests:** real disposable PostgreSQL + signed Gateway fixture tests, cross-Owner 404, idempotency, SSE resume, approval and cancellation. Exact-SHA quality PASS (#38205681718).
- [x] **3 / Nonbillable simulated model persistence:** native Codex text and terminal persisted in disposable PostgreSQL, Owner-only durable receipt true; only confirmed DB evidence can mark UI persisted.
- [x] **Technical production release:** Shared/Gateway/Chat new GHCR images, candidate, signed smoke, formal traffic and protected-ten cleanup PASS (#38206216152); independent GCP 100%/digest/Ready/trace header PASS (#38206616628). Dispatch/BYOK OFF.
- [ ] **Real provider-to-DB P0:** requires newly observed, authorized real Owner reply with canonical PostgreSQL text and terminal, subject/Owner isolation and budget guard. The previous 0/3 historic trial is not retrospectively repaired; do not reset it or send unauthorized Codex turns.
- [ ] **Real two-Google-Owner runtime denial:** no legitimate automated Owner B user-ID-token source is available; mark `NOT_VERIFIED_AUTOMATION_UNAVAILABLE` rather than restoring a human OAuth gate.
- [ ] **Root-cause correlation of a future failure:** if it recurs, join the displayed random request ID with authorized server audit phases and an Owner-scoped DB receipt, without logging identity, prompts or tokens. Historical unique cause remains unknowable without missing evidence.


### 2026-10-12 Current P0 handoff — durability receipt deployed

- [x] Real GHCR code-only deployment SHA `8c269be5` and three Cloud Run
  formal 100%-traffic revisions PASS.
- [x] Independent exact-image/Ready/100% production readback, anonymous
  and invalid-token denials for Owner receipt endpoint PASS (#38198404857).
- [x] Cross-Owner receipt negative and durable positive on disposable
  PostgreSQL with nonbillable Gateway fixture in exact-SHA CI.
- [x] Flutter only labels PostgreSQL persisted answer after read-only
  receipt; missing DB proof never becomes PASS.
- [ ] Owner A real Codex report vs canonical DB 0/3 and zero new turns still
  needs root-cause correlation; do not demand manual Google OAuth validation.
- [ ] True signed Google user token end-to-end if legitimate non-human
  automation credentials become available; otherwise record
  NOT_VERIFIED_AUTOMATION_UNAVAILABLE without blocking code-only release.
- [ ] Owner B authenticated runtime isolation, provider SSE/reconnect/
  approval/cancel and real persisted text acceptance; no extra Codex
  calls or extensions without explicit bound.
- [ ] Real provider enablement requires separate Owner permission and
  entitlement/billing guards, and must not be inferred from successful
  code-only release.


### 2026-10-12 P0 Owner durability next gate

- [x] Owner-specific DB receipt API and cross-Owner HTTP/PG fixture tests
  implemented, no OAuth manual test or provider request.
- [x] Flutter only displays database-confirmed answer persistence and
  clears proof on thread/Owner change; UI negative test included.
- [ ] Current SHA full CI and production **code-only** release evidence
  verified; do not infer from this document or pending Actions.
- [ ] Runtime gap remains: reported Codex reply vs trial budget 0/3 and
  canonical `omniagent_chat` zero new Owner threads/turns. No artificial
  provider calls, token disclosure or trial-budget reset.
- [ ] Authenticated live Owner B negative and provider end-to-end
  durable SSE/reconnect/approval/cancel independently verified using
  legitimate automated credentials/fixtures; no manual Google OAuth gate.


### 2026-10-12 Active engineering handoff (after code-only formal release)

- [x] Exact-main full quality + GHCR 3-image publish, Cloud Run 0% candidate,
  signed smoke, code-only GHCR formal traffic promotion and independent
  100% traffic/digest/disabled-feature readback. Evidence: see
  [Acceptance](acceptance.md) 2026-10-12 checkpoint.
- [x] Protected **ten Revision** policy and actual cleanup: Shared / Gateway /
  Chat each retain 10; 37 obsolete tags and 37 obsolete revisions removed;
  fallback, fixed preview and Owner trial protections preserved.
- [x] Owner waiver: human Google OAuth login / A→B→A manual acceptance
  REMOVED / NOT REQUIRED. Keep automated JWT, IAM/HMAC and Owner negative tests.
- [ ] **P0-A**: reconcile reported Owner A Codex reply against canonical
  `omniagent_chat` readback (trial used 0/3, no new threads/turns as of
  evidence run #38152820347). Identify real Chat origin, API request path,
  Owner issuer/subject and server-side writes without manual login or
  leaking OAuth tokens. Do not reset the 3-turn budget or call provider
  just for diagnosis.
- [ ] **P0-B**: actual Owner-bound PostgreSQL/SSE text+terminal persistence,
  replay/reconnect, approval/decline/cancel and automated multi-Owner
  isolation evidence; separate API user-OAuth E2E subgate can remain
  NOT_VERIFIED_AUTOMATION_UNAVAILABLE when genuine automated user token absent.
- [ ] **P0-C**: only after independent app gates pass and explicit entitlement/
  billing authorization, enable real model dispatch for the appropriate
  Owner. Code-only production is already live with dispatch/BYOK OFF.
- [ ] Never reopen human OAuth gate or add actual rollback **rehearsal** to
  required P0 gates; Owner previously waived it. Keep emergency failure
  recovery and code/runtime evidence as required.


### 2026-10-12 最新有效 OAuth 驗收政策

- **不再進行人工 OAuth 真人登入／A→B→A／Preview 驗收：NOT_REQUIRED，不是假造 PASS。**
- **保留全部可自動化 OAuth 身分及安全測試**：token issuer/audience、錯誤與匿名拒絕、Client 設定、Owner 綁定、IAM/HMAC、跨 Owner 負向測試。
- 缺少合法自動化真人使用者 token 時，僅該單項標為 NOT_VERIFIED_AUTOMATION_UNAVAILABLE；不可使用服務帳號 ID token 冒充真人登入，也不要求人工補測。
- 模型授權、Chat→Gateway→PostgreSQL/SSE 持久化、隔離、CI、部署及正式流量讀回仍各自驗收。之前 P0 資料庫衝突不因取消人工驗收而 PASS。
- 完整政策：[OAuth 自動驗收政策](../docs/oauth-automated-acceptance-policy.md)。下方歷史真人 OAuth 必經 gate 自本日起不再適用。


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



The operator explicitly waived the **real rollback rehearsal** for this release.
A one-shot, commit-marker-bound workflow stages: full GitHub Actions quality
(including disposable PostgreSQL, Flutter), current GHCR zero-traffic candidate,
signed live smoke, read-only three-service preflight, guarded formal traffic
promotion, and then guarded latest-ten Revision cleanup. This may be executed
only from an exact current main commit carrying `[release-once]`; future pushes
without that marker cannot promote via this workflow. It retains a previously
validated GHCR fallback without exercising a rollback drill. Emergency
restoration on a failed partial promotion remains enabled.

**Important scope boundary:** the technical release can ship disabled-by-default
dispatch/BYOK functionality; it does not authorize billable Owner Codex inference
or convert missing owner/provider/SSE/approval/reconnect acceptance into PASS.
If any workflow/Secret/traffic/retention gate fails, report PARTIAL/BLOCKED
with its receipt rather than claiming success. Actual execution, CI run,
Cloud Run traffic and deletion results must be checked against GitHub/runtime;
this file records source policy, not deployment evidence.

# omniAgent TODO

### 2026-10-10 Formal release request — actual promotion NOT YET AUTHORIZED BY ACCEPTANCE

- [x] Last source 78225a7f: exact-SHA Node/Flutter/PostgreSQL and all 3
  GHCR images PASS, 0%-traffic candidate deployment PASS, signed smoke PASS.
- [x] New protected read-only GHCR-only production readiness workflow checks
  the *current* source/candidate and a separately verified new-GHCR fallback,
  disabled dispatch/BYOK, Ready state, immutable digest, enabled Secret
  reference state and unchanged formal traffic. Produces redacted evidence.
- [ ] Real accepted Owner-scoped provider inference, persisted SSE replay,
  approval/cancel/reconnect and accepted GHCR-only formal rollback rehearsal
  are still NOT VERIFIED. Human OAuth is NOT_REQUIRED; automated OAuth checks remain mandatory.
- [ ] Authorize real paid Codex/other provider inference only after the
  separate user permission and owner-specific credential/entitlement checks.
- [ ] Once all real gates PASS, implement/execute safe formal traffic release
  and independent recovery drill; then protected last-ten revision retention.
- [ ] This read-only audit workflow never mutates formal traffic or
  interprets static CI/healthy /ready as completion.


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
