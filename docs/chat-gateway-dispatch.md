# Chat → Gateway one-shot dispatch: bounded integration

### 2026-10-10 Safe running-turn inspection

GET /internal/v1/chat/reconciliation:candidates requires the existing trusted internal-service identity and configured dispatch. It provides bounded owner-scoped identifiers only, with no prompts, credentials, queue mutations or provider invocations. Age is based on created_at, not claim time, and must not imply safe retry.


## 2026-10-10 Model-entitlement and OpenRouter SSE integrity — CODE ONLY

Chat dispatch remains OFF by default. Enabling `CHAT_DISPATCH_ENABLED=true`
in a later, separately approved acceptance requires two independent inputs:
`CHAT_DISPATCH_APPROVED_OWNER_IDS` (real approved Owner UUIDs) and
`CHAT_DISPATCH_ENTITLEMENTS_JSON` (nonempty, bounded explicit records).
Each record must contain exactly `ownerId`, `runtime` (`gemini`,
`openrouter`, or `codex`), `model`, and `credentialMode:"platform"`.
Example **format only, not a real owner**:

```json
[{"ownerId":"00000000-0000-4000-8000-000000000001",
  "runtime":"gemini","model":"gemini-2.5-flash","credentialMode":"platform"}]
```

A UUID absent from the separate allowlist, unsupported runtime, wrong
model, duplicate, unrecognized field, BYOK credential mode, or paid
OpenRouter platform model is rejected before startup/claim. The Chat
API checks the authenticated Owner's persisted thread Runtime/Model
before writing a message. PostgreSQL's queue claim filters the same
allowlisted Owner/Runtime/Model tuples before changing a turn to RUNNING,
using row locks and SKIP LOCKED. An unentitled queued turn stays QUEUED;
a mismatched claim stops before provider invocation. Independent
Gateway Codex Owner Secret mapping is still a separate required gate.

OpenRouter SSE requires a real [DONE] terminator before emitting a
successful turn_completed. Truncation, provider error frames, invalid
JSON or payload, oversized bytes/text, or excessive event counts
fail closed without a false completed turn; a streaming UTF-8 decoder
handles Chinese split across network chunks. Fixtures do not call
external models or read credentials.

**STATUS: SOURCE IMPLEMENTED; exact-SHA CI + candidate/runtime
acceptance pending.** No model access, Secret setting, provider billing,
BYOK lifecycle, formal traffic cutover or production rollback is
authorized or performed by this change.


## 2026-10-10 Transactional Gateway event persistence — implementation staged

The Chat dispatcher now hands each already-validated Gateway response to
`ChatStore.appendGatewayEvents` rather than writing individual events
across separate transactions. The PostgreSQL method locks the
owner/thread/turn, checks it is RUNNING, rejects any existing event ID,
writes all response rows with monotonically increasing thread-local
sequences and changes the turn to its terminal status within **one**
transaction. Any insertion, binding, credential-sanitization, or terminal
state failure rolls the transaction back; clients must not observe a
partially committed Gateway answer. A subsequent replay attempt is
rejected for explicit reconciliation; the provider is **never**
automatically re-invoked on an uncertain outcome. The failure-response
`turn_error` uses the same transactional path.

The disposable PostgreSQL acceptance test injects a deliberate
constraint failure **on the second event** and verifies that the first
event and final turn state were not committed. It then commits a
valid response, verifies ordered replay, terminal state, duplicate
rejection, cross-owner denial and credential exclusion. All tests run
against CI's disposable DB only; no live owner/model/Secret or paid
provider is invoked.

**Status: STAGED-CODE** pending exact-SHA tests/CI. Even a green test
does not verify real Chat → Gateway provider execution or owner-scoped
live PostgreSQL SSE replay. Model entitlements and billable Codex remain
disabled pending the user's explicit decision; unified application
acceptance and formal traffic changes remain later gates.


**Current status: SOURCE / TEST INTEGRATION; LIVE AUTHENTICATED PROVIDER ACCEPTANCE OPEN.**

### 2026-10-09 signed boundary: verified local, live owner prerequisites missing

`f9a4a7b5d4d226d47af6aa526d49d10737b44406` introduced
a real local Gateway HTTP signature roundtrip with an injected
nonbillable Provider fixture and owner-scoped persisted event calls.
[Full CI/GHCR #37924500076](https://github.com/tommylin15/omniAgent/actions/runs/37924500076)
PASS; [new 0% GHCR candidates #37924894616](https://github.com/tommylin15/omniAgent/actions/runs/37924894616)
and [auto signed smoke #37925039627](https://github.com/tommylin15/omniAgent/actions/runs/37925039627)
PASS. Current candidates Chat `00038-yog`, Gateway
`00029-ter`, Shared `00018-poq`. These tests do **not**
prove a real signed provider turn from deployed Chat.

[Actual GCP metadata re-run #37925330111](https://github.com/tommylin15/omniAgent/actions/runs/37925330111)
is read-only PASS, while Chat dispatch is disabled, zero owners
approved, Chat Gateway URL/Audience not configured for latest
Gateway candidate, and Gateway lacks directly configured
`CODEX_OWNER_SECRETS`. The Gateway bundle ref is present, but
`loadAgentBundle()` imports only the provider API keys and HMAC,
**not** owner-scoped Codex secret locators. Do not infer those
per-owner credentials or valid HMAC payload from a configured
bundle reference. No Secret payload was read.

Before real Codex end-to-end acceptance, approve the actual logged-in
owner's entitlement and an explicit bounded provider test, configure
only that owner's established Codex Secret resource and Gateway
routing/identity consistently, perform one signed Chat → Gateway
turn, and verify events persisted and replayed only within the
approved owner's PostgreSQL scope. Formal GHCR promotion and
rollback remain later, separately gated work.

### Browser OAuth and account isolation — operator-confirmed PASS

**2026-10-09:** Operator performed the A → B → A sign-in sequence on
the latest GHCR 0%-traffic Chat candidate and reported both checks
successful: B could not view A's prior thread, and A could view its
thread again after returning. Mark **OPERATOR-REPORTED MANUAL PASS**
for this browser account-switch isolation and visible persistence only.
Do not claim that backend independent queries, production end-to-end
owner identity checks, positive Gateway HMAC, billable Codex inference
or event replay were established by that report.
No private credential, account ID, or Owner UUID is required to record
the manual result. Pending steps are the bounded, approved-owner
signed Chat→Gateway dispatch and durable persistence gate, followed
by release/promotion and real GHCR-only rollback. Production formal
routing stays unchanged.

### Latest 2026-10-09 zero-traffic live negative security check

[Real IAM and HMAC-negative probe #37917980938](https://github.com/tommylin15/omniAgent/actions/runs/37917980938)
is PASS on the latest accepted public GHCR candidate. A Chat service
identity ID token can access the private Gateway tagged /health route;
an anonymous principal cannot. The Gateway /internal/v1/assistant/turn
route refuses missing, malformed or expired HMAC headers with HTTP 400.
Each test intentionally uses a non-routable runtime and cannot perform
a billable Provider request. It is **not** proof of accepted HMAC,
reconstructed provider events or database persistence. All formal
traffic percentages remained unchanged.

A currently verified, public 0%-traffic Chat candidate for a **real
human** browser check:
https://ghcr-f2a5be442595---omniagent-chat-2oo7qbkd5q-uc.a.run.app

Manual browser OAuth acceptance recipe (completed by operator, 2026-10-09; historical instructions):
1. Sign in with Google account A; create one harmless thread/message;
   message remaining `QUEUED` is expected while dispatch is disabled.
2. Sign out, sign in with account B; verify A's threads/messages are
   not visible. Create a separate harmless B test thread.
3. Sign out, sign back in with A; verify only A's thread reappears.
4. Report either successful A/B/A isolation or the stage and generic
   error label, without providing passwords, cookies, OAuth tokens,
   emails, or owner UUIDs. A "Google origin not allowed" error on the
   ephemeral candidate URL is **NOT VERIFIED**, not user separation PASS.

Until real owners and bounded billable model usage have been approved,
do not set `CHAT_DISPATCH_ENABLED=true`, invent owner UUIDs,
assume an HTTP 200 health check proves provider inference, or switch
formal production traffic. The current endpoint only dispatches in
response to an explicit authorized call; there is no background
scheduler/consumer and a queued user message is not a completion.

The existing Chat service now includes a service-authenticated POST endpoint
`/internal/v1/chat/dispatch:once`. It is disabled unless the process starts
with `CHAT_DISPATCH_ENABLED=true` **and** a non-empty comma-separated
`CHAT_DISPATCH_APPROVED_OWNER_IDS` set of verified owner UUIDs. The
PostgreSQL claim itself filters on this allowlist so an unentitled OAuth
user's work is not consumed or charged to platform keys. It uses the existing
`CHAT_INTERNAL_ALLOWED_EMAILS` allowlist for the calling service identity;
the HTTP caller cannot choose an owner, thread, model, or pending turn.

Once enabled and invoked, one worker invocation:

1. Atomically claims a durable `QUEUED` turn from the owner-scoped PostgreSQL
   schema with `FOR UPDATE SKIP LOCKED`; transitions it to `RUNNING`.
2. Uses `CHAT_GATEWAY_URL` (private Cloud Run Gateway or 0% test tag URL)
   and `CHAT_GATEWAY_AUDIENCE` (canonical untagged Gateway service origin).
3. Generates the actual Chat runtime service's audience-bound Google ID token.
   The exact JSON body is signed with the approved timestamp/HMAC protocol
   using `mcp_owner_signing_key` from **existing** `OMNIAGENT_BUNDLE`.
   No separate signing Secret, API credential or browser token is introduced.
4. Validates provider event types, logical owner/thread binding, payload
   sanitization, bounded sizes and a single trailing terminal event. Codex
   native thread IDs do not determine owner-scoped PostgreSQL routing.
5. Persists the events under the claimed `owner_id/thread_id/turn_id`.
   The existing thread events SSE endpoint replays persisted results.

**Crash and billing safety:** claim happens before the external provider call.
An uncertain provider HTTP outcome is recorded as `turn_error` with a generic
code; no raw provider response body, ID token, signing key or error string is
persisted. Database persistence failures require explicit reconciliation.
`RUNNING` turns are never automatically requeued, because an external
provider may have already performed non-idempotent work.

**Never treat this as an automatic/fully durable production dispatcher.**
There is deliberately no timer, background polling, external scheduler or
auto-execution after returning a Chat HTTP response. Cloud Run can scale to
zero and throttle requestless CPU; an explicit authenticated invocation is
needed for each queued turn. This version also does not reconstruct a
multi-turn conversation, implement resumable Codex continuation, owner BYOK
policy, tool approval lifecycle or crash recovery. Before setting the opt-in
flag in Cloud Run, approve a bounded operator/service triggering policy,
provider costs and an attempt/recovery audit design, test the real candidate
via two human Google identities and cross-owner isolation, then prove
provider/approval/cancel/reconnect/replay and rollback.

The new Actions pipeline does **not** enable `CHAT_DISPATCH_ENABLED` or
promote production traffic. No GCS, Artifact Registry, Cloud Build trigger,
historical database, backups or non-omniAgent project is altered by this
source-only integration.
