# P0 Owner Chat — implementation and single acceptance gate

**Scope:** Chat Owner model entitlements, Gemini Flash-Lite allowlist,
Codex native turn start / approval / cancel / refresh, PostgreSQL replay,
Flutter state / A-B isolation, and one-shot release authorization behavior.

**Do not infer DONE from source or CI alone.** Until there is a documented
exact-SHA, signed Cloud Run candidate, real Owner binding and permitted
provider readback, production application P0 is **NOT VERIFIED**.

## Preflight and deployment prerequisites

1. Validate `main` tests / GHCR quality and three public immutable images
   for the *same* commit; reject stale commits.
2. Apply only omniAgent additive PostgreSQL migration
   `infra/postgres/migrations/004_codex_live_turns.sql` after 001/002/003,
   with audited database readback. Migration 004 is idempotent and contains
   no data deletion.
3. `CHAT_DISPATCH_ENABLED` remains **false** unless an Owner approves a
   bounded real provider test. Google OAuth alone does not authorize
   inferencing. Enablement requires `CHAT_DISPATCH_APPROVED_OWNER_IDS`,
   exact `CHAT_DISPATCH_ENTITLEMENTS_JSON`, matching private
   `CHAT_GATEWAY_URL` and `CHAT_GATEWAY_AUDIENCE`, an enabled
   `mcp_owner_signing_key` in the service bundle and approved Gateway IAM.
4. Codex additionally requires explicitly Owner-bound
   `CODEX_OWNER_SECRETS` mapping to managed Secret Manager resources on the
   Gateway. Never put auth payloads, API keys, handles or identifiers into
   repository config or test receipts. Gemini Chat allows only the three
   Flash-Lite identifiers; paid inference is never inferred from the catalog.
5. Gateway native sessions currently use **process-local handles** (up to
   ten minutes). Set and verify single-instance routing/affinity before
   live continuation tests; a restarted/missing session must produce
   a reconciliation error, not an implicit second inference.

## Chat-facing endpoints

- `GET /v1/me` and `GET /v1/models` return only the verified Owner
  identity and allowed model metadata.
- `POST /v1/threads/:thread/messages` persists one idempotent Owner turn;
  non-Codex runtimes retain bounded atomic terminal event writes.
- Codex uses signed Gateway `/internal/v1/assistant/turn:start`.
  Any in-progress turn stores a **private** native control mapping in
  `omni_chat.codex_turn_sessions`, never returned to the user.
- `POST /v1/threads/:thread/turns/:turn/refresh` polls one claimed native
  turn; approval and cancellation use the existing Owner-bound routes
  and signed Gateway `approval` / `turn:cancel` RPCs.
- `GET /v1/threads/:thread/events?cursor=N`, or `Last-Event-ID` if
  cursor is omitted, replays committed PostgreSQL SSE rows only from the
  authenticated Owner. UI reconnects from the last committed sequence.

## Safety invariants

- Native control claim, digest binding and pending-decision reservation are
  durable before Gateway RPC. No automatic retry after unknown provider or
  persistence outcome. Approvals in RESOLVING require explicit reconciliation.
- No browser-provided Owner ID, native session handle, Secret resource or
  native thread ID may control a different Owner's turn.
- New rollback rehearsal is waived by the Owner, not marked as performed.
- An ordinary candidate smoke without `[release-once]` is **NOT_RUN**
  for formal cutover, not a failed release nor permission to switch traffic.
- The technical promotion workflow still requires the positive exact-main
  release marker and readiness checks; it does not authorize live billable
  inference or BYOK automatically.

## One consolidated acceptance

- Same-SHA Node/PG integration, Flutter analyze/test/build and signed
  Gateway/Codex fixture tests: **CI PENDING until run verified**.
- New GHCR images → 0%-traffic candidate → signed smoke and backend
  401/403/health: **NOT VERIFIED for this commit until deployment**.
- Real approved Owner model turn → durable text deltas → native approval,
  decline, cancellation and SSE reconnect → Owner B denial → UI readback:
  **NOT VERIFIED**; requires approved Owner credentials and bounded permission.
- Formal promotion and latest-ten retention: only after separately
  approved release scope, exact current SHA checks, and cutover readback.

This document covers only omniAgent. Legacy WBS status rows represent
historical checkpoints, not current runtime evidence.
