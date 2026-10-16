# omniAgent

Independent Chat and Agent platform: Flutter frontend, owner-scoped Chat API/PostgreSQL, private Agent Gateway and Shared Codex. **Full product status is PARTIAL**, not general-availability acceptance.

## Current verified runtime (2026-10-14, Asia/Taipei)

- Gateway-only Gemini production: **PASS**. [Signed three-caller release #38559065522](https://github.com/tommylin15/omniAgent/actions/runs/38559065522).
- Independent Cloud Run formal serving, IAM and revision readback: **PASS**. Chat `00069-tep`, Gateway `00076-pog`, Shared Codex `00046-naj`, each Ready at 100% traffic, [audit attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/38498845455/attempts/3).
- Cloud Run revision cleanup: **PASS at snapshot**, 31 removed, each service exactly 10 left. [Execution #38574373341](https://github.com/tommylin15/omniAgent/actions/runs/38574373341).
- Gateway `GEMINI_SHARED_EXECUTION_ENABLED=true`, but Chat `CHAT_DISPATCH_ENABLED=false` in formal production. A private Gateway live route is **not** full public Chat inference.
- Single approved Owner Gemini Preview and PostgreSQL persisted response: PASS for that limited path, [DB readback #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212).
- Other consumer P0-V paths: technical handoff **consumer-reported PASS**, without independent per-consumer production/database receipt in this repository.

## Documentation

The authoritative **current** status and requirements are [TODO](doc/todo.md), [Acceptance](doc/acceptance.md), [WBS](doc/wbs.md), [SPEC](doc/spec.md), [CI/CD runbook](docs/cicd-ghcr-actions-runbook.md), [Gateway integration contract](docs/shared-gemini-vertical-slice.md) and [risk audit](docs/project-risk-audit-2026-10-14.md). Historical Cloud Build and older stage checkpoints are evidence, not current release status.

PostgreSQL/omni_chat remains the hot state authority. GCS artifacts and Iceberg/BigLake analytics remain target architecture. Direct Groq provider **source exists** but has no accepted full Chat dispatch integration. BYOK/credential management remains separately gated.

Development: `npm ci && npm run build && npm test` at repository root; `flutter pub get`, `flutter analyze lib test`, `flutter test`, `flutter build web` in `apps/agent_app`. These commands alone are not evidence a specific commit passed CI or production.
