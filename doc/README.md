# omniAgent current control documents

> Executable baseline validated through `main@d1769491ba41670e86222536ee129b94bbfba04f`; Node Core run `37628904846` PASS. UI source baseline `12a94018debd11f5b389aa2fdf325339782bb9d8`; Flutter run `37625912746` PASS.
> Architecture/control revision: 2026-10-07.
> 2026-10-07 ownership cleanup also changed Gateway configuration/headers, Cloud Build wiring and CI. Runtime deployment remains open until GCP preflight and live acceptance pass.

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
- external domain systems = bounded API/MCP providers only, never omniAgent's internal storage or deployment source.

These are architecture requirements. Current implementation status is recorded in SPEC/WBS/TODO/acceptance and must not be upgraded merely because the design is approved.

## Document map

| Document | Purpose |
| --- | --- |
| [spec.md](spec.md) | Product/system specification and requirement/status truth table. |
| [wbs.md](wbs.md) | Work breakdown through provider credential isolation, data lifecycle and final acceptance. |
| [todo.md](todo.md) | Prioritized actionable backlog. |
| [ui.md](ui.md) | Flutter interaction model and Warm Cozy Twin Beast Visual Contract. |
| [visual-assets.md](visual-assets.md) | Twin Beast / omniAgent visual source registry, Drive source-of-record linkage, production-asset gaps. |
| [acceptance.md](acceptance.md) | Evidence and security/isolation/storage acceptance gates. |
| [current GitHub Actions/GHCR release runbook](../docs/cicd-ghcr-actions-runbook.md) | New CI/CD target, WIF, GHCR immutable digests, Cloud Run 0%-traffic candidates, integration/rollback/diagnostics. |
| [固定 preview 網址與發布規則](../docs/cicd-ghcr-actions-runbook.md#固定-preview-網址與每次發布規則2026-10-09) | 固定入口、每次驗證與恢復政策、OAuth 設定及已實作／待辦差距。 |
| [固定 Preview guarded source and activation](../docs/cicd-ghcr-actions-runbook.md#2026-10-10-fixed-preview-source-implementation--staged-for-unified-acceptance) | Staged implementation, disabled-by-default release gate, restoration safeguards and deferred live acceptance. |
| [historical Cloud Build V2 runbook](../docs/cicd-v2-runbook.md) | Earlier Cloud Build release execution and evidence; superseded for future releases. |

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
