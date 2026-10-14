# P0 Owner Chat — current acceptance and incident runbook

**Updated 2026-10-14.** One authorized Owner using Gemini Flash-Lite on fixed Preview had a successful text response, historical UI reload and one independently observed durable PostgreSQL terminal turn. This is **Preview-only PASS**, not acceptance of formal production Chat Dispatch or two-Owner operation.

## Verified baseline

- [Owner UI and database readback #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212): one durable COMPLETED Gemini turn with nonblank persisted text and a terminal event. The owner's browser-observed answer and reload are separate reported evidence; absent exact requestId correlation do not claim every hop was traced.
- [Production GCP inventory attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/38498845455/attempts/3): formal Chat `00069-tep`, Ready at 100%, `CHAT_DISPATCH_ENABLED=false`; Gateway Gemini production separately ON.
- Historical initial create-thread failures lacked complete Cloud Logging correlation. Do not invent a unique root cause or require repeating already accepted Owner browser UI proof.

## When a new Chat request fails

1. Record the **sanitized** HTTP status, `X-OmniAgent-Request-Id`, `X-OmniAgent-Revision`, event cursor, runtime/model, release SHA and UTC time. Never collect bearer tokens, raw user email, prompt, Secret payload or other Owner's data.
2. Through properly authorized service-side logging, correlate `omniagent_chat_request_audit` phases (`thread_committed`, `message_committed`, `dispatch_settled`, `dispatch_needs_reconciliation`, `receipt_readback`, `sse_replay`, `request_failed`). A missing stage is **unknown** until server/DB evidence confirms it.
3. Read the approved Owner's PostgreSQL turn receipt read-only: state, text_delta existence, `turn_completed` and durable terminal flag; use rollback-safe SQL, not speculative UI inference.
4. Verify exact serving Cloud Run revision, private Gateway IAM, allowed service account and disabled/enabled Dispatch/BYOK flags. A successful local `/health` does not mean the upstream model is live.
5. For idempotency/reconnect tests, replay using the **same** request key and event cursor, verify no extra provider billable execution or duplicate terminal DB turn. For cross-Owner tests, use legitimate controlled user identity, not service-account impersonation as a fake browser OAuth receipt.
6. Diagnose and classify the precise failure, update tests and require source→CI→candidate→deployment→runtime confirmation before closure.

## Remaining gates

- Controlled **formal** Chat model dispatch enablement with Owner entitlement and budget, real persisted response, negative IAM/Owner tests and rollback.
- Two-Owner authorization, Codex execution context, approval/cancel/reconnect, failure recovery and mobile/desktop real UI acceptance.
- Human Google OAuth login/A→B→A manual test is **NOT_REQUIRED**; all feasible automated OAuth/JWT/security acceptance remains mandatory.

Detailed older P0 trial and deployment history is retained in Git history and Actions artifacts. See [active TODO](../doc/todo.md), [acceptance](../doc/acceptance.md), and [risk audit](project-risk-audit-2026-10-14.md).
