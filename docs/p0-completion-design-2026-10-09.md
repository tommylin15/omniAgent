# P0 completion design — 2026-10-09

Status: user approved with "同意，照這個做" on 2026-10-09; approval is not implementation or acceptance evidence.

## Requested outcome

Finish thread deletion and Chinese response repair, then complete the six P0 groups from the current backlog in one batch before final production promotion. Preserve the currently promoted 1a8e575 three-service release while preparing candidates. Model authorization was deferred for the initial repair and requires explicit real-owner inputs for the P0 batch.

## Scope and approach

1. Real provider dispatch: use the existing Google IAM plus HMAC Gateway contract. Enable only explicitly approved owner UUIDs. Resolve exact production/candidate URL and audience from live owned-service metadata. Codex requires an approved owner-to-Secret resource map; credentials stay in Secret Manager. Provider/model eligibility and bounded paid-call allowance must be known before live inference. No Groq or BYOK subsystem in this P0 batch.
2. Persistence/isolation: retain PostgreSQL as live authority. Add an omniAgent-owned migration for per-turn runtime binding (handle, native thread/turn IDs, persisted gateway cursor and continuation), without credential payloads. Bind every operation to owner/thread/turn. Preserve request idempotency; reconcile uncertain provider outcomes without automatically repeating inference. Test real PostgreSQL positive and negative ownership cases.
3. Interaction E2E: connect Chat to existing Gateway turn:start, turn:events, approval and turn:cancel routes. Persist native events and approval bindings before acknowledging them to UI. Poll/reconnect uses durable Chat cursor. Ensure APPROVED/DENIED decisions reach the exact native request; validate digest and expiry. Handle process loss as an explicit terminal error, never a successful recovery or automatic repeat. Gateway native handles are process-bound; runtime routing/affinity must be tested and limitations documented. Expose only owner-bound approved MCP operations through existing contracts; test discover/call/cancel/disconnect against a real bounded test endpoint.
4. Preview: use one shared GitHub deployment concurrency group for candidate, preview, promotion and rollback. Snapshot preview and protected allocations, recheck exact SHA/revision/digest, update only preview tag, verify health/ready/UI/anonymous rejection. On failure restore previous preview only if current state still matches this operation; record recovery failure or concurrent drift rather than overwrite it. Save sanitized success/failure evidence as Actions artifacts.
5. Human login: verify the fixed preview OAuth origin and A-B-A isolation with two real accounts. Automated fixtures and earlier login at a different origin cannot replace this gate. Never request passwords or tokens in chat.
6. Formal release/recovery: implement a protected release entry point with exact candidate and prior verified GHCR revisions/digests. Snapshot formal traffic, run real candidate acceptance, rehearse actual new-GHCR fallback traffic and readback, then restore/promote the accepted batch. On partial failure recover to the approved GHCR fallback. Finish at 100% of the accepted batch and verify health/ready/private IAM boundaries. No revision retention, legacy deletion or credential retirement in this P0 batch.

## Existing files and intended changes

- services/chat-api/storage.ts and infra/postgres/migrations/: durable turn runtime binding, approval forwarding state, safe terminal/cancellation transitions.
- services/chat-api/gateway_dispatch.ts and server.ts: owner-bound native lifecycle calls and persistence, deterministic response/error behavior.
- services/agent-gateway/server.ts and codex_bridge.ts: reuse existing bounded lifecycle APIs; fix only demonstrated compatibility/isolation gaps.
- apps/agent_app/lib/chat_page.dart and chat_api.dart: lifecycle status, cancellation, approval, reconnect and deletion/UTF-8 repair.
- .github/workflows/omniagent-ghcr-cloudrun-candidate.yml, omniagent-ghcr-current-candidate-smoke.yml: common lock, safe preview validation and recovery.
- scripts/verify_preview_route.py and dedicated release helper/workflow: guarded exact-version promotion/rollback and sanitized evidence.
- tests/chat_api.test.ts, chat_dispatch.test.ts, chat_storage.acceptance.test.ts, Flutter widget tests and Python routing/release tests: ownership, idempotency, expiry, process loss, concurrency, failure recovery and traffic restoration.

## Verification and delivery

Small meaningful tests run during implementation. After the whole batch: exact-SHA Node/Python/PostgreSQL/Flutter/security CI, immutable public GHCR images, zero-traffic candidates, real owner/provider/MCP and two-account browser acceptance, preview recovery, real traffic rollback, final promotion and readback. Record failures honestly; a missing prerequisite leaves its P0 item open. Run ponytail-review before every commit/push.

## Inputs needed for live completion

- Two real owner UUIDs; approval for the exact account/provider/model combinations.
- Existing omniAgent-owned Codex Secret resource mapping and runtime accessor permission.
- Provider call count or spend cap for Gemini/Codex validation; OpenRouter free-only is the bounded default until paid calls are authorized.
- Approved real MCP test endpoint/tool contract and authentication if required.
- Human A-B-A login on the fixed preview source.

No credentials, owner IDs, endpoint names or acceptance results will be invented. No external repository or external database/storage will be read to resolve these inputs.
