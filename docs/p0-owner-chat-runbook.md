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
- `GET /v1/threads/:thread/turns/active` returns one unfinished
  Owner-bound Chat turn ID/status to restore controls after browser reload,
  without exposing native Gateway handles.
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

## Evidence as of 2026-10-11

- `infra/postgres/migrations/004_codex_live_turns.sql`: **live DB PASS**,
  exact execution SHA `fa39b5894d506510fdbf4210538f22f8b0db589e`,
  [GitHub Actions #38110699581](https://github.com/tommylin15/omniAgent/actions/runs/38110699581).
  Real readback confirms owner `omniagent_chat_app`, table
  `omni_chat.codex_turn_sessions`, FK, and RESOLVING constraint.
  No other logical databases were modified by the migration script.
- Runtime Owner authorization, Codex credentials, Gateway single-instance
  config and real signed provider turn are **NOT VERIFIED**.
- The metadata-only Owner inventory runs after *current-SHA signed smoke*:
  `.github/workflows/omniagent-p0-owner-runtime-readonly.yml`. It reports
  only model entitlement counts and presence flags; it never reads secret
  payloads or prints Owner UUIDs. Missing configuration is **BLOCKED**, never
  promoted to DONE merely because the inventory job returns success.
- Owner inference remains disabled until the credential source, exact
  entitlement, permitted model, provider cost boundary, and positive
  human authorization are verified. Do not create credentials in the repo,
  Chat messages or Artifact receipts.

## Owner authorized 3-turn live Codex trial (2026-10-11)

The Owner selected option A: **real Codex inference may use allowance or incur
charges, for their own verified Owner only, at most three native turns**.
This is an *authorization*, not a claim that credentials or billing are ready.

The hard cap is enforced transactionally by
`omni_chat.codex_trial_budgets` (migration 005). Every successful
QUEUED→RUNNING Codex claim atomically consumes one allowance **before**
Gateway/provider invocation. Failures and cancellations still consume the
allowance; no automatic refunds, resets or retries. Concurrent claims
cannot exceed three; missing/expired budget rows deny execution.
The migration itself grants zero users any turns. A valid budget row must
be enrolled once for the Owner UUID read from the *authenticated*
`GET /v1/me`, with `max_turns=3` and expiry within 24 hours of approval.
Never infer identity from GitHub usernames, emails, screenshots or a client
request body. Explicit Owner enrolment must be audited in the
`omniagent_chat` database. Do not change another Owner's grant.

Codex credential provisioning is a separate mandatory prerequisite:
verify an existing Owner-specific Secret Manager `auth.json` source
or have the Owner complete official Codex sign-in. Do not export credentials
to this chat, Drive documents, GitHub Secrets, logs or PRs. The current
candidate runtime inventory detected zero approved Owners,
`CODEX_OWNER_SECRETS` absent, dispatch disabled and signed route
unconfigured. No actual provider call has been made in this trial.

The Owner can use the model at most three times **in total**, across
browser reloads, threads and deployment revisions, not three times per
session or instance. Run a second Owner denial, PostgreSQL count readback,
streamed answer, approval/decline/cancel, and reconnect checks against
the same exact deployed SHA before reporting acceptance. A provider
cost cap cannot be asserted merely from turn count; actual billing
remains under the provider's account/quota rules.

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
