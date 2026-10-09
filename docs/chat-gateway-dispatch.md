# Chat → Gateway one-shot dispatch: bounded integration

**Current status: SOURCE / TEST INTEGRATION; LIVE AUTHENTICATED PROVIDER ACCEPTANCE OPEN.**

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
