# Chat → Gateway one-shot dispatch: bounded integration

**Current status: SOURCE / TEST INTEGRATION; LIVE AUTHENTICATED PROVIDER ACCEPTANCE OPEN.**

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
