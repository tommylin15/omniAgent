# omniAgent current control documents

> Baseline: `main@4a5f74ca60c0859a8727568290b388101cbae6c1` (2026-09-23, Asia/Taipei review date).

This `doc/` directory is the consolidated **current control set** for product scope, implementation work, UI, acceptance, and remaining execution. It is derived from the current repository source plus the existing `docs/` migration/evidence records.

## Authority order

When sources disagree, use this order:

1. Live/runtime/deployment evidence and current GitHub implementation.
2. Tests and CI evidence tied to the exact commit under review.
3. This `doc/` control set for current scope, work breakdown, and acceptance intent.
4. Existing `docs/` records for migration history, approved plans, and point-in-time evidence.

A document update, image build, or code merge alone is **not** proof that a feature is live or accepted.

## Document map

| Document | Purpose |
| --- | --- |
| [spec.md](spec.md) | Product/system specification, ownership boundaries, requirements, and implementation status. |
| [wbs.md](wbs.md) | Work breakdown structure from current state through final acceptance. |
| [todo.md](todo.md) | Prioritized actionable backlog with explicit acceptance conditions. |
| [ui.md](ui.md) | Current Flutter UI behavior, target interaction model, endpoint mapping, and UI gaps. |
| [acceptance.md](acceptance.md) | Evidence model and phase/final acceptance gates. |

## Relationship to existing `docs/`

The existing `docs/` directory remains valuable and should not be overwritten as if it were stale history. In particular:

- `docs/phase-6b-dev-evidence.md` is the point-in-time Phase 6B dev evidence checkpoint.
- `docs/phase-6-deployment-plan.md` is the approved deployment planning record.
- `docs/chat-storage-migration.md`, `docs/migration-from-janus.md`, and `docs/runbook-ui-cutover.md` preserve migration/cutover constraints.
- `docs/architecture.md`, `docs/ui.md`, and `docs/todo.md` are earlier/current split checkpoints and remain traceable source material.

This directory does **not** erase those records. It provides a normalized view of what the current code means now.

## Status legend

- `DONE-CODE`: implemented in repository source and covered by source-level evidence; not necessarily deployed.
- `VERIFIED-DEV`: verified against a real dev service or real provider at the cited checkpoint.
- `PARTIAL`: some code/evidence exists, but the end-to-end requirement is not accepted.
- `OPEN`: not implemented or not evidenced sufficiently to claim completion.
- `BLOCKED`: cannot be accepted until an explicit dependency/gate is satisfied.

## Current headline status

- Phases 0–5: closed migration checkpoints, not equivalent to live cutover.
- Phase 6: deployment planning gate closed.
- Phase 6B: **PARTIAL**. A private omniAgent Gateway candidate and real Gemini/OpenRouter dispatch were previously verified in dev, while Chat/UI live deployment, Chat DB activation, Chat→Gateway dispatch, owner-isolated Janus context/MCP integration, Codex managed auth, continuous browser streaming/reconnect, historical migration, and cutover/rollback remain unaccepted.
- Latest `main` adds Google ID-token sign-in integration, a Chat candidate smoke configuration, and a dev DB setup script, but no workflow/status evidence was attached to the reviewed head commit; these changes are therefore source progress, not a live acceptance upgrade.
- Janus remains the live Chat writer until a separately accepted routing/storage cutover.
