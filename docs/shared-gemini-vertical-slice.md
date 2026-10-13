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
8 KiB UTF-8 prompt, 512 maximum generated tokens, 32K returned characters,
60s HTTP timeout. No grounding,
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

> Current status: **Gateway G0/G1 and bounded CI-identity portion of G2 PASS; G3/G4 OPEN**. No consumer application has yet been shown to invoke the Gateway from its own runtime. No formal production traffic was moved.

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

**Remaining gates:** [ ] genuine owner-authorized Chat UI / DB roundtrip; [ ] market-mart original API/job roundtrip; [ ] life-assistant original backend/API roundtrip; [ ] per-consumer identity impersonation and failure behavior; [ ] controlled formal Gateway promotion and then each consumer's authorized release. No human OAuth acceptance gate is reintroduced.

## 2026-10-13 omniAgent Chat signed-Dispatch follow-up

The existing Chat UI uses Owner-authorized `POST /v1/threads/:id/messages`, PostgreSQL ChatDispatcher, and the signed private Gateway `POST /internal/v1/assistant/turn`. This is **not** the dedicated `/v1/gemini/execute` identity pilot. Gateway's existing approved `OMNIAGENT_PROVIDER_BUNDLE` imports the provider key and HMAC secret. Positive Chat runtime Google ID token, Gateway IAM, matching signing key, real verified Owner UUID and Gemini-only entitlement are separately required.

Signed Chat Gateway Gemini requests now specify 512 maximum output tokens and 60-second deadline, and reject blank model output rather than persisting a false successful turn. Source and test hardening do **not** establish a real user OAuth, PostgreSQL event receipt or UI response. Never substitute a service-account token for a Google user OAuth token. No human OAuth acceptance requirement is reinstated.

## 2026-10-13 actual Chat Owner-scoped staging evidence (not live OAuth E2E)

- Signed source `b38a96b42de4fdb50f7ae624323860ab43b7ef99` hardened the existing HMAC-signed **Chat** Gateway Gemini branch with `maxOutputTokens=512`, 60s timeout and empty-response rejection. Node Core, Flutter, GHCR quality and unit tests PASS; these do not create a real user OAuth token.
- GHCR main release `1cb6542b178db026f8bb1714d71ae43c5721af25`: [public images PASS #38364416557](https://github.com/tommylin15/omniAgent/actions/runs/38364416557), [private Cloud Run 0%-candidate PASS #38364754380](https://github.com/tommylin15/omniAgent/actions/runs/38364754380), [signed candidate smoke PASS #38364920352](https://github.com/tommylin15/omniAgent/actions/runs/38364920352). A previous GHCR candidate verification failed because the same Cloud Run environment entries had changed **order only**; [redacted runtime comparison #38364224690](https://github.com/tommylin15/omniAgent/actions/runs/38364224690) confirmed all names+values, service identity and VPC match. CI now sorts by environment name and rejects duplicates, preserving all content/security comparisons.
- [One Owner Gemini-only Chat canary #38365294643](https://github.com/tommylin15/omniAgent/actions/runs/38365294643) **PASS**. The one approved Owner was independently matched to an OAuth-backed `omniagent_chat` DB owner by known digest (no UUID in source/logs). Exactly one Gemini-3.5-Flash-Lite entitlement was configured on private/tagged **0%** Chat revision `p0v-gemini-chat-1cb6542b`. Its real HTTP /health, /ready, /, /main.dart.js returned 200, anonymous /v1/models and /v1/threads returned 401. The deployment restored the Chat **service template** to Dispatch OFF after creating the tagged candidate. Formal Chat/Gateway traffic unchanged; no Gemini inference was triggered by this staging job.
- **NOT VERIFIED**: actual end-user Google OAuth HTTP request to Chat candidate, persisted authenticated Chat turn, HMAC route invocation originating from Chat, Gateway Gemini response persisted/replayed as Owner SSE, and Flutter UI receipt. Existing CI uses signed **service-account** identities; such a token is not a real Google **user** token. `real_user_google_oauth_e2e=NOT_VERIFIED_AUTOMATION_UNAVAILABLE`. The user explicitly removed human OAuth acceptance: do not reintroduce it as a release gate or misstate it as PASS. Production `CHAT_DISPATCH_ENABLED` remains OFF.
- Consumer runtime round trips and formal production Gateway activation also remain OPEN, independently of the three CI impersonated service-account Gemini successful responses.
