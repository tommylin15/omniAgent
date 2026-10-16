# P0-V private Gemini Gateway — current integration contract

**As of 2026-10-14 (Asia/Taipei): Gateway-only production is PASS; formal Chat Dispatch is OFF; complete multi-user product acceptance remains PARTIAL.** Do not treat any earlier test-route/retention plan as current state.

## Evidence

- [Owner-authorized production Gateway release #38559065522](https://github.com/tommylin15/omniAgent/actions/runs/38559065522): signed positive and negative tests for all three project callers on candidate and formal endpoints, anonymous denial and release receipt.
- [Controlled retention #38574373341](https://github.com/tommylin15/omniAgent/actions/runs/38574373341): removed 31 revisions and retired 31 old tagged URLs.
- [Independent GCP runtime readback attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/38498845455/attempts/3): Chat `00069-tep` 100%, Gateway `00076-pog` 100%, Shared `00046-naj` 100%, all Ready and 10 revisions each. Gateway and Shared have private invoker IAM. Gateway `GEMINI_SHARED_EXECUTION_ENABLED=true`; Chat `CHAT_DISPATCH_ENABLED=false`.
- [Owner single-turn Preview DB receipt](https://github.com/tommylin15/omniAgent/actions/runs/38381669212): one durable Gemini terminal reply; user observed the historical response after browser refresh. Single-owner Preview only.
- Life and market-mart report their technical integrations PASS. On **2026-10-16**, the user reconfirmed a successful Life → omniAgent connection, recorded as **CONSUMER_REPORTED_PASS for connectivity only**; this message did not include a requestId, response/provider usage, or Life-side DB/schema/release receipt. Do not infer complete Gemini inference, persistence or consumer acceptance from the connection report.

## API and trust boundary

The three backend consumers are `omniagent`, `market-mart` and `life-assistant`. Route: `POST https://omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app/v1/gemini/execute`. Signed Google ID token audience is the **base Gateway service URL**. Cloud Run IAM and the Gateway's project-to-allowed-service-account map both apply. This is not a browser/public inference route.

The request includes `project`, `ownerId`, `requestId`, `prompt` and approved Flash-Lite `model`; consumers are responsible for authenticating and authorizing their **end users** and for their own downstream schema/DB/publication decisions. A valid project SA is not itself evidence of end-user ownership.

| Limit | market-mart | Chat / Life |
| --- | ---: | ---: |
| Prompt UTF-8 bytes | 32,768 | 8,192 |
| JSON envelope bytes | 131,072 | 131,072 |
| Max output tokens | 2,048 | 512 |

Gateway: 60-second timeout, max two simultaneous calls **per process instance**, no automatic provider retries. A 429/503/504 is an error, not a success or permission for the caller to retry without bounded idempotency/cost approval. A model `MAX_TOKENS`, blank reply, invalid CEO JSON, or schema validation failure must not be published to consumer business storage.

## Still open

Production Chat Dispatch needs separately approved Owner/model entitlements, cost limits, signed E2E, persisted terminal/DB and cross-Owner rejection. Consumer-owned production end-to-end receipts remain separate. All future Cloud Run candidates can change the revision count, so retention must re-evaluate serving, fallback and live tagged URLs rather than re-run obsolete cleanup plans.

Reference [single current TODO](../doc/todo.md), [acceptance matrix](../doc/acceptance.md), [risk audit](project-risk-audit-2026-10-14.md). Older dated checkpoints remain recoverable in Git history and Actions artifacts; they are deliberately not repeated as current status here.
