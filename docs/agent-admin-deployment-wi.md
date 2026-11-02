# OA-ADMIN-01~04｜Agent 設定草稿 Admin 部署與驗收 WI

正式 Drive 規格：[OmniAgentGPT Agent／Gemini／Admin 規格](https://docs.google.com/document/d/1ne10yXQL46nyZ4c4PmG37jwZOabiT0RBDTIkHEOkM1I/edit?usp=drivesdk)；工程依 GitHub 及 Runtime 收據。

**2026-11-02｜來源 main@18f8c2f｜此頁為待執行操作指示，不是執行收據。** 只有指定 Admin 登入可見/修改草稿。Cloud Run Paid Routing 與 Agent Worker 不可因本 WI 自動啟用；保持 `CHAT_DISPATCH_ENABLED` 原有授權門檻。

## 先決條件與確認

1. 核對 [TODO](../doc/todo.md)、[Agent 規格](agent-loop-roadmap.md)、[Acceptance](../doc/acceptance.md) 與 CI [#41371490056](https://github.com/tommylin15/omniAgent/actions/runs/41371490056)、0% Candidate [#41372318617](https://github.com/tommylin15/omniAgent/actions/runs/41372318617)、Smoke [#41372517960](https://github.com/tommylin15/omniAgent/actions/runs/41372517960)；以同 SHA/Artifact digest 為準。**Release #41372567786 整體 FAIL**；promotion step PASS、retention 因 `older_revision_has_live_tag` BLOCKED。正式環境的 100% traffic/revision/tag/rollback 要另行只讀驗證，禁止直接清有 live tag 的舊 Revision。
2. 從真實 Google OAuth verified `/v1/me.ownerId`／DB Owner mapping 取得指定 Admin UUID，將其經 Cloud Run 受控設定設為 `AGENT_ADMIN_OWNER_IDS`；不能用 email、IAM SA、前端 header 或偽造 token 當 Admin。這和 Router Usage 的 `ROUTER_USAGE_ADMIN_OWNER_IDS` 分別管理。
3. 系統先維持 `AGENT_ADMIN_SETTINGS_ENABLED` **未開啟**；此時 `/v1/admin/agent-settings` 為 404，Admin 入口不顯示，且不影響既有 Chat/Shared Gateway。
4. 在正式 `omniagent_chat` DB 以授權管理員只讀查核 `omni_chat`、 migration ledger、實際 Chat SQL role（避免把 `gcp_mcp_oauth` 或其它專案 schema 當本案），先做適當備份/rollback checkpoint。

## 資料庫 migration / 權限

- Migration：`infra/postgres/migrations/010_agent_admin_settings_draft.sql`，僅建 `omni_chat.agent_admin_settings`、`omni_chat.agent_admin_settings_audit`。僅指定可授權的 DB operator 在正確資料庫執行；禁止由對話直接生成無監督憑證／擴權。
- 兩表以及 `agent_admin_settings_audit_audit_id_seq`（由 PostgreSQL identity 產生，實際名稱以 catalog 查核）需由 **Chat runtime DB role** 取得最小必要的 SELECT/INSERT/UPDATE/sequence 權限。先核對現有 owner/grant、只授權所需，不給 `PUBLIC`、其它 App roles、權限不跨 schema。
- 經 TLS 主機驗證/同網段受控途徑，驗證新表存在、唯一 singleton/version、CAS stale version 會 409、每次成功變更寫一筆 audit。真正會產生資料修改的 fixture 必須限於受控候選或明確核准的測試 Owner；不能盲目刪正式配置。
- 回復：先將 `AGENT_ADMIN_SETTINGS_ENABLED=false`，使 API/UI 失效，再核對業務無依賴。保留兩表與 audit 作 rollback 可稽核證據；**不得自行 DROP TABLE/清 audit**，除非取得另外核准與備份證據。

## Candidate → Runtime / 正式 Gate

1. 確認 Admin ID、DB role、migration、flag 定義齊全才建 **private/0%-traffic candidate**；在 candidate 啟用 `AGENT_ADMIN_SETTINGS_ENABLED=true`，原正式 revision 保持不變。
2. 真 Google Admin OAuth：`GET /v1/me` → `agentAdminEnabled=true`；`GET /v1/admin/agent-settings` → `activation=draft_only`；`PUT` 帶 `expectedVersion` 成功後重新 GET 應 version+1、audit 寫入和 unchanged `effective.paidRoutingEnabled=false`／`agentExecutionEnabled=false`。
3. 真 Google 非 Admin OAuth：`GET /v1/me` 無管理入口；GET/PUT 管理 API 回 403；匿名 401；錯誤模型、額度越界、Key/Owner 注入欄位 400，版本衝突 409；攻擊/測試不能寫入 audit。
4. Flutter 手機/桌面受控候選：驗 Admin 入口可見，非 Admin 不顯示；模型選單無 overflow、儲存/重整/草稿與生效狀態明確區分；不顯示 API Key/Secret。
5. 該版不執行 Gemini Paid API、跨域 Tool Call、外部文件寫入、Model Entitlement 變更。保留已核准 Chat/OAuth/Shared Gateway regression，既有 Life/Janus caller 不能被影響。
6. 若要 production，先取得雙 Owner 安全及 formal Chat/Agent gate、同 SHA CI/候選/DB runtime receipts，再走可回退的正式發布；發布後獨立驗證 100% traffic 和 DB/Owner 實際狀態。**不因本 WI 而自動允許切流**。

## 目前驗收收據（截至此版）

- **CODE:** PASS（Admin 只存草稿、OID allowlist、PG migration、offline Gemini/Agent Core）。
- **TEST/CI:** PASS [#41371490056](https://github.com/tommylin15/omniAgent/actions/runs/41371490056)（Node、Flutter、PostgreSQL CI）。
- **GHCR:** PASS [#41371490016](https://github.com/tommylin15/omniAgent/actions/runs/41371490016)。
- **0%-Candidate/Smoke:** PASS [#41372318617](https://github.com/tommylin15/omniAgent/actions/runs/41372318617) / [#41372517960](https://github.com/tommylin15/omniAgent/actions/runs/41372517960)；guarded fixed preview 發布 SKIPPED。
- **Auto Release:** `one_shot_ghcr_traffic_promotion=PASS`，**overall FAIL**（Shared Codex retention `older_revision_has_live_tag`），正式產品驗收不足。
- **Admin 真 OAuth 200/403、正式 migration、正式環境 settings API/DB readback、Paid Key、真 Agent E2E：** NOT_VERIFIED。

對應下一入口：**OA-ADMIN-03 正式 migration／least privilege readback → OA-ADMIN-02 真 Admin/非 Admin Candidate → Retention tag/rollback 安全盤點 → 後續 OA-GEMINI paid 與 OA-AGENT Worker**。
