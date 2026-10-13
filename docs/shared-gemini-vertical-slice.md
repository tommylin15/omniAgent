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
8 KiB UTF-8 prompt, 512 maximum generated tokens, 32K returned characters,\n60s HTTP timeout. No grounding,
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

> Current status: **SOURCE ONLY until latest Actions, Cloud Run and all three
> consumers are independently verified.** Record exact run IDs and release SHA
> before upgrading any gate to PASS.
