# omniAgent current control documents

> Implementation baseline reviewed: `main@75336a248381d935c7b23dd8afab06f5e9c4151a`.
> Architecture/control revision: 2026-10-07.
> This documentation-only revision does not change executable code, SQL migrations, CI/CD, infrastructure, secrets, or deployed resources.

This `doc/` directory is the consolidated **current control set** for omniAgent product scope, architecture, implementation work, UI, and acceptance.

## Authority order

When sources disagree:

1. live/runtime/deployment evidence and current GitHub implementation;
2. tests/CI tied to the exact reviewed commit;
3. this `doc/` control set for current requirements and work intent;
4. `docs/` planning, migration, and point-in-time evidence;
5. external concept notes.

A document update is never implementation or live acceptance evidence.

## Current architecture decisions

The current target is:

- PostgreSQL/`omni_chat` = authoritative hot runtime state;
- GCS = large immutable artifact/object layer;
- Iceberg on GCS = long-term conversation/event/audit/analytics archive;
- BigLake/BigQuery = optional analytical query layer when separately approved;
- BYOK + entitled platform credentials = independent credential plane;
- `owner_id` = memory/data isolation boundary regardless of which provider key pays/authenticates the request;
- Codex execution context = owner-isolated even when platform authorization is reused;
- Agent Gateway provider target = Gemini, OpenRouter, Codex, plus planned direct Groq support;
- Janus = external bounded domain/tool provider only, never omniAgent's internal storage.

These are architecture requirements. Current implementation status is recorded in SPEC/WBS/TODO/acceptance and must not be upgraded merely because the design is approved.

## Document map

| Document | Purpose |
| --- | --- |
| [spec.md](spec.md) | Product/system specification and requirement/status truth table. |
| [wbs.md](wbs.md) | Work breakdown through provider credential isolation, data lifecycle and final acceptance. |
| [todo.md](todo.md) | Prioritized actionable backlog. |
| [ui.md](ui.md) | Flutter interaction model including future credential selection/management. |
| [acceptance.md](acceptance.md) | Evidence and security/isolation/storage acceptance gates. |

Supporting architecture/migration records remain under `docs/`, especially `docs/architecture.md`, `docs/chat-storage-migration.md`, deployment plans/evidence, and cutover runbooks.

## Status legend

- `DONE-CODE`: source exists; not necessarily deployed.
- `VERIFIED-DEV`: real dev/provider evidence exists for the cited checkpoint.
- `PARTIAL`: some source/evidence exists but the end-to-end requirement is not accepted.
- `OPEN`: not implemented or not adequately evidenced.
- `BLOCKED`: dependency/gate prevents acceptance.
- `TARGET-DESIGN`: approved architecture direction with no completion claim.

## Current headline status

Phase 6B remains partial at the reviewed GitHub baseline. The new credential/data-lifecycle design is `TARGET-DESIGN`: no direct Groq adapter, generalized Credential Resolver, omniAgent GCS artifact tier, Iceberg archive pipeline, or BigLake/BigQuery analytics path is claimed as implemented by this documentation revision.
