# omniAgent：Agent Loop、Gemini 雙 Key、Admin 控制台架構 v0.1

日期 2026-11-02。唯一 TODO：`doc/todo.md`。設計與實作分階段；此文件不代表正式生效、付費 Key 配妥或真實跨服務 E2E 通過。

## 2026-11-02 實作與驗收同步（以 GitHub 為準）

- **Repo source:** `main@18f8c2ff5572eaf6248dc452a62b85aaf6d55c07`。本規格的架構仍為目標；目前只完成 **Admin settings draft 第一版 + offline Gemini routing policy + offline read-only bounded Agent Loop**。
- **已存在程式：** `apps/agent_app/lib/agent_admin_page.dart` + `chat_page.dart`（Admin-only entry）、`services/chat-api/server.ts`/ `main.ts` / `agent_admin_settings.ts`（OAuth Owner UUID gate + GET/PUT draft + CAS version + audit）、`infra/postgres/migrations/010_agent_admin_settings_draft.sql`（尚未套到正式 DB）、`services/agent-gateway/gemini_route_policy.ts`（純邏輯）、`agent_loop.ts`（純離線有界唯讀）。
- **非已實現：** 未連接 Secret Key 配置狀態（Admin UI 僅顯示「不揭露」）、未提供 Owner/Model 權限修改 UI、未接真 Gemini Paid 模型/Google Billing、未實作 LangGraph/Function Calling/Cloud Run Agent Worker、未接 Life/Janus/Calendar/Drive 的真工具、未啟用 production Admin endpoint。數字設定是**草稿**，不是生效的預算閘門。
- **可重跑來源：** [CI #41371490056](https://github.com/tommylin15/omniAgent/actions/runs/41371490056) Node、Flutter、PostgreSQL acceptance PASS；[GHCR #41371490016](https://github.com/tommylin15/omniAgent/actions/runs/41371490016) PASS；[0% candidate #41372318617](https://github.com/tommylin15/omniAgent/actions/runs/41372318617) PASS；[smoke #41372517960](https://github.com/tommylin15/omniAgent/actions/runs/41372517960) PASS。
- **Release 部分結果：** [Auto Release #41372567786](https://github.com/tommylin15/omniAgent/actions/runs/41372567786) `one_shot_ghcr_traffic_promotion=PASS`；隨後 `older_revision_has_live_tag` 阻擋 Shared Codex revision 清理，使整體 Release FAIL；`formal_release_gate=BLOCKED_MISSING_LIVE_APP_ACCEPTANCE`。缺少同 SHA Admin/DB/正式環境獨立讀回時，不將 partial success 寫成 DONE。
- **下一動作與安全邊界：** [受控 Admin 設定 WI](agent-admin-deployment-wi.md)；維持正式付費路由／Agent Worker OFF，須先檢查 DB migration、DB role/sequence 權限、真 OAuth admin/visitor 正反例與 revision tag/rollback，再進下一工程卡。

## 產品操作
Flutter Chat 輸入自然語言 → Chat API（OAuth/Owner/Thread/Turn/SSE）→ Agent Worker（有界 plan/tool/observe/final、checkpoint/approval）→ Model Gateway（Gemini）及 MCP Host（工具執行）→ Life/Janus/Calendar/Drive。資料屬於各來源，omniAgent 不跨庫讀寫領域資料，並保留 Chat 的單 Owner Preview 與 Gateway 原有 Lite 服務。

## 模型、Key、成本
- `gemini_api_key` 是既有 Flash-Lite 設定；`gemini_paid_api_key` 是建議新增在 Secret Manager/omniagent-bundle 的付費 credential，絕不保存在 UI/Chat/API/log/GitHub。API key 所屬專案及 Cloud Billing 決定 tier；**同專案兩 key 不產生不同免費/付費配額**。
- Google AI Pro 隨附 US$10 GCP credit 不等於 Gemini Developer API 已啟用 Paid Tier，不等於預算硬上限；要核對 project、billing、prepay、實際費用/抵扣。
- Route profiles：`public-lite`（Lite + 原 Key，僅非私人資料與已核對 free tier）；`private-lite`（Lite + paid Key，私人資料）；`advanced-flash`（Flash + paid Key）。資料敏感度由可信的來源 contract 決定，非 LLM 或使用者自報。Flash ID 必須 provider models-list 真實確認。
- 既有 Shared Gemini/Life/Janus 路徑仍 Lite-only。新 paid route 必須雙重 gate（Admin 版本化規格 + 部署 flag + Owner entitlement + 真 credential + budget），未就緒一律拒絕且不回退 Free Key。
- Model Gateway ledger 只記 provider 真實 tokens / model、版本化價格/賬單資訊；缺值 UNKNOWN，不得把 Chat turn 當成 provider 調用、或憑估算宣告實際抵扣。對付費路由需事前預留可允許的 budget，異常不得無限重試。

## Agent Runtime
- TypeScript 單 Agent loop，優先評估 LangGraph.js graph/persistence；不先建多個 agent。Graph state 包含 runId/owner/thread/turn/step/budget/known evidence；模型只能回傳 `final` 或已授權 Tool 的結構化指令。
- 每回合設定決策上限、工具上限、時間上限、輸出 byte 上限及 Token/費用上限。工具 JSON Schema、Owner grant/Google OAuth audience/Scope 由後端確認，回應作不可信資料處理，加入來源與讀取時間。
- PostgreSQL agent_runs, agent_steps, agent_checkpoints, tool_receipts/lease；外部寫入結果不明時禁止直接重放，改先 readback；long running 使用 Cloud Run Job，interact 用 bounded Worker；既有 Chat SSE/Approval/Cancel 繼承。
- L0 只讀、L1 摘要/草稿允許受限自動執行，L2 行程/待辦/文件修改需 Admin 設定允許＋個別使用者確認，L3 交易、大量刪除、IAM/Secret/正式部署不能由一般 Agent 自動執行。

## Admin 控制台：權限與資料契約
- 導航：AI Chat AppBar 的「Agent 設定」；只有 `/v1/me.agentAdminEnabled=true` 才顯示。此 flag 依 **後端 Google OAuth verified principal → PostgreSQL owner_id → AGENT_ADMIN_OWNER_IDS** 白名單取得。Router 戰情室的 Admin 授權獨立。
- 後端 `/v1/admin/agent-settings`：GET 只讀設定草稿；PUT 驗證 JSON、預期版本、拒絕未授權、界限驗證、版本衝突採 409、每次更新留 owner/time/changed settings audit。任何寫入都是**draft**，不直接改 Secret、IAM、GCP Billing、Cloud Run env、模型權限或啟用 Agent。
- UI 操作：預算（owner/global daily call、token、cost USD）、Agent maxSteps/maxTools/maxSeconds/maxOutputBytes、三條 profile 選模、選用 Scope 與 Tool allowlist（在 Adapter 實作前僅顯示未接入）、L2 approval policy、功能開關（顯示 proposed vs effective）、Secret 狀態（boolean, 無明文）、Gateway/worker/Router Usage 來源狀態及更新版本；不存在的數值顯示未配置而非 0。
- 初期 Admin 只調整 offline draft，部署 `AGENT_ADMIN_SETTINGS_ENABLED` 及實際 runtime policy gate 均為 OFF。這能讓 UI 可管理但不造成付費功能旁路。下一階段必須有具體 worker/ledger 設計與 runtime 讀回才可讓部分設定生效。
- PostgreSQL 專用 versioned config/table + audit，後端讀寫均按 Admin Owner gate；不得把設定草稿的 model allowlist 擴權成正式 entitlements。刪除/重設留 rollback 和 revision。

## 四個 Connector
- Life：重用既有 curated API，需另外 owner-scoped read adapter，不能借用高權限 curator ingestion token 給一般 Chat。
- Janus：只使用 read-only MCP janus_sources/market/private；private 必須本人 `janus.private.read` OAuth，沒有 token 不存取持股。
- Google Calendar：逐用戶授權最低 scope、查空檔；新增需 L2 approval/actionId/寫後 readback。
- Google Drive：逐用戶 OAuth 和限定資源搜尋；專案文件工作限定 OmniAgentGPT 授權範圍，不可擴搜其他 Drive root；任何正式文件更新需 L2 及原規格治理。

## 高價值工作流
跨專案規格差異/進度、生活週規劃/活動協調、Janus 投資研究（唯讀）、Gmail 候選（需要新 OAuth）、台灣活動自主 Agent shadow→Life 正式 gate。背景 Job 要有 checkpoint、runId 和通知，不為此複製 Life/Janus 功能。

## 驗收順序
1. Admin 設定草稿 UI+API+PostgreSQL 版本/授權負例；部署 flag OFF。
2. Gateway paid model route contract (OFF)、真 provider Tier/Key Secret/用量 readback。
3. Bounded Agent Loop 單測、Function Calling model adapter、Tool Registry schema+Owner grant。
4. PostgreSQL checkpoint/leases、獨立 Agent Worker、Chat SSE/Approval、雙真人 OAuth。
5. 四 Connector 真讀、跨工具 E2E、L2 審批寫入和 readback。
6. exact SHA CI→0% private candidate→runtime/PG 讀回→使用者授權後正式發布。

完成狀態依 CODE/TEST/CI/CANDIDATE/PROD/RUNTIME/E2E 分開列示；CI PASS 不代表正式生效。