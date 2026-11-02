# omniAgent

Independent Chat and Agent platform: Flutter frontend, owner-scoped Chat API/PostgreSQL, private Agent Gateway and Shared Codex. **Full product status is PARTIAL**, not general-availability acceptance.

## Historical verified runtime snapshot (2026-10-14, Asia/Taipei)

- Gateway-only Gemini production: **PASS**. [Signed three-caller release #38559065522](https://github.com/tommylin15/omniAgent/actions/runs/38559065522).
- Independent Cloud Run formal serving, IAM and revision readback: **PASS**. Chat `00069-tep`, Gateway `00076-pog`, Shared Codex `00046-naj`, each Ready at 100% traffic, [audit attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/38498845455/attempts/3).
- Cloud Run revision cleanup: **PASS at snapshot**, 31 removed, each service exactly 10 left. [Execution #38574373341](https://github.com/tommylin15/omniAgent/actions/runs/38574373341).
- Gateway `GEMINI_SHARED_EXECUTION_ENABLED=true`, but Chat `CHAT_DISPATCH_ENABLED=false` in formal production. A private Gateway live route is **not** full public Chat inference.
- Single approved Owner Gemini Preview and PostgreSQL persisted response: PASS for that limited path, [DB readback #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212).
- Other consumer P0-V paths: technical handoff **consumer-reported PASS**, without independent per-consumer production/database receipt in this repository.

## 2026-11-02 新 Agent/Admin 工程快照（尚未全部上線）

- `main@18f8c2f` 的 **Admin 設定草稿**（Owner allowlist + Flutter、Chat API、migration 010）、**Gemini paid routing offline policy**、**有界唯讀 Agent Loop core** 已加入。沒有真付費 Key、LangGraph Worker 或 Life/Janus/Google 工具執行。
- [完整 CI #41371490056](https://github.com/tommylin15/omniAgent/actions/runs/41371490056) Node／Flutter／PostgreSQL PASS、[GHCR](https://github.com/tommylin15/omniAgent/actions/runs/41371490016) PASS、[0% candidate](https://github.com/tommylin15/omniAgent/actions/runs/41372318617) PASS、[smoke](https://github.com/tommylin15/omniAgent/actions/runs/41372517960) PASS。
- [Auto Release #41372567786](https://github.com/tommylin15/omniAgent/actions/runs/41372567786) **整體 FAIL**：one-shot promotion step PASS，Shared Codex 舊 live tag 導致 retention BLOCKED；另缺正式 App 驗收。沒有最新 Admin OAuth／migration 實際部署與 DB 讀回，不宣稱設定 UI 正式生效。
- 規格與下一步：[Agent Loop / Gemini / Admin](docs/agent-loop-roadmap.md)、[Admin 部署 WI](docs/agent-admin-deployment-wi.md)、[唯一 TODO](doc/todo.md)、[驗收狀態](doc/acceptance.md)。

## Documentation

The authoritative **current** status and requirements are [TODO](doc/todo.md), [Acceptance](doc/acceptance.md), [WBS](doc/wbs.md), [SPEC](doc/spec.md), [CI/CD runbook](docs/cicd-ghcr-actions-runbook.md), [Gateway integration contract](docs/shared-gemini-vertical-slice.md) and [risk audit](docs/project-risk-audit-2026-10-14.md). Historical Cloud Build and older stage checkpoints are evidence, not current release status.

PostgreSQL/omni_chat remains the hot state authority. GCS artifacts and Iceberg/BigLake analytics remain target architecture. Direct Groq provider **source exists** but has no accepted full Chat dispatch integration. BYOK/credential management remains separately gated.

Development: `npm ci && npm run build && npm test` at repository root; `flutter pub get`, `flutter analyze lib test`, `flutter test`, `flutter build web` in `apps/agent_app`. These commands alone are not evidence a specific commit passed CI or production.
