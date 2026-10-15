# omniAgent — 16 項風險工程修復計畫

基準：2026-10-15；來源：[R01–R16 風險稽核](project-risk-audit-2026-10-14.md)、[現行 TODO](../doc/todo.md)、[Acceptance](../doc/acceptance.md)。這份文件**只核准規劃與驗收準則，不代表已修復、核准新增費用或允許正式開關**。進度狀態以 GitHub/main 與執行中 GCP 證據為準。

## 批次 A：正式 Chat、安全與資源權限（P0）

| ID／狀態 | 工程入口與執行工作 | 必要測試、CI、部署／runtime 驗收 |
| --- | --- | --- |
| **R01 OPEN** | `services/chat-api/main.ts`、`gateway_dispatch.ts`、`model_entitlements.ts`：明確 owner/model entitlement、每日／每請求成本上限、預算拒絕、Gateway private signed 調用與失敗收據；保持 production Dispatch OFF 直到另案受控啟用。 | 同 source SHA 的 allow/deny、自動 IAM/HMAC、不可重複計費、真實 Chat→Gateway→PostgreSQL terminal readback、controlled 0%→正式 scope 與復原 |
| **R02 OPEN** | `shared_gemini.ts`、`shared-codex/server.ts` 及消費端 API 合約：定義由已驗證 backend 簽署／附帶的 Owner 授權 assertion（或等效有界 DB-bound receipt）；不依任意 `ownerId` 字串直接授權；不跨專案讀 DB。 | 同 SA 合法 owner 正向／偽造 owner、錯誤 project/SA、到期、audience、重放與跨 Owner 負向測試；不得外洩 user prompt/token |
| **R03 OPEN** | `services/chat-api/database.ts`：先確認 active `CHAT_DATABASE_TLS_MODE`，再將 private-self-signed 模式遷移到受信 CA／hostname verification，取消正式環境不驗身分的長期路徑。 | 正確 CA 成功、錯 CA／錯 hostname 拒絕、network timeout；Stage DB 實測、Secret/IAM/ready 讀回及受控回退 |
| **R04 OPEN** | `shared_gemini.ts`、Shared Codex 和 PostgreSQL：跨 Cloud Run instances 的 project/Owner 模型調用配額、requestId 去重、provider call 前預留計量，fail-closed，費用與 429／503 dashboard。 | 兩執行個體併發、重放／timeout／失敗回收、quota 429、計費事件一致性；核對 Cloud Run max-instances 及 Google billing alerts |
| **R05 OPEN** | `chat-api/storage.ts`、`server.ts`、`codex_session_store.ts`、Flutter events：整合兩 Owner／Codex、SSE resume、approval/cancel、故障後 terminal reconciliation。 | 真正合法且自動化的 Owner A/B 身分正負例、DB 同 requestId、斷線重連無重複、故障注入。無合法 token 時標 NOT_VERIFIED_AUTOMATION_UNAVAILABLE，不恢復人工 OAuth gate |
| **R15 OPEN** | `infra/gcp/bootstrap-omniagent-ci.sh`、`bootstrap-omniagent-postgres-access.sh`：盤點**實際** GCP IAM，將 one-time bootstrap 與日常 WIF CI 主體分權，縮小 project-wide Run/Cloud Build/OS Admin/IAP。 | read-only IAM 差異表＋least-privilege 測試；在 Stage 驗證 GHCR publish、private Cloud Run inventory、Postgres probe；受控修 IAM 再獨立讀回 |

**批次 A 的先後**：A0 只讀 runtime/IAM baseline → R02、R03、R04、R15 安全與成本措施 → R05 兩 Owner E2E → 受控 R01 正式 Chat 推論。任何一項缺收據不能提前對所有人開放。

## 批次 B：運作可靠性／舊資源治理（P1）

| ID／狀態 | 工程入口與執行工作 | 必要退出條件 |
| --- | --- | --- |
| **R06 OPEN** | `services/agent-gateway/server.ts` ManagedAuthStore：用 Secret ETag/CAS 或鎖服務取代 process-local mutation lock；將 version rotation 設為可恢復，不在讀回新版本前破壞唯一舊版本。 | 多 instance 同時 rotate／失敗 rollback 測試，Secret 管理最小 IAM；不記錄 credential |
| **R07 OPEN** | `.github/workflows/*release*/*retention*`：盤點 one-shot markers、manual apply 與現在依賴；正式封存或改預設 read-only，保留一個受控且受版本／fallback guard 保護的新入口。 | dry-run 與惡意 marker 測試不會改 traffic/tag/Revision；Owner scope、exact SHA、readback |
| **R08 OPEN** | `apps/agent_app/lib/chat_api.dart`：每個 logical POST 操作固定 UUID idempotency key（直到終態），明確 timeout、cancel／retry UX 與 reconnect。 | 同一次重試只一筆 DB turn／一個 billable call；斷網、延遲、重按、返回頁面 Flutter 回歸 |
| **R09 OPEN** | `.github/workflows/omniagent-ghcr-*`：在結論中區分 Quality、GHCR image digest、0% candidate、formal promotion、runtime receipt；將 stale-main/no-op SKIPPED 標 NOT_RUN。 | failure/skip/success fixture、自動檢查 image SHA／3 digest；正式 release summary 不得以整體綠燈冒充發版 |
| **R10 OPEN** | `services/chat-api/server.ts`、受限 Logging viewer：requestId 階段事件、DB receipt digest 化查詢、避免機敏日誌。 | 模擬 thread 400/401/409/5xx，能用 requestId 找出階段及 durable state，沒有 prompt/token/PII |
| **R11 OPEN** | `groq_provider.ts`、`assistant_dispatch.ts`、BYOK Credential Resolver、model entitlement／Flutter：完成 Groq/OpenRouter/Owner key vs platform key 的接線與 Secret revoke/rotation。 | 缺憑證拒絕、跨 Owner deny、實際 provider→DB→UI、費用邊界；無核准則 production flag 保持 OFF |
| **R16 OPEN** | `infra/gcp/retire-legacy-codex-auth.sh`：從一般操作入口退出；破壞性 Secret retirement 必須單獨明確授權、列出 dependencies 和復原方案。 | 不具批准不刪；計畫／執行有分離收據，未知 downstream 依賴時 BLOCKED |

## 批次 C：文件／資料生命週期（P1–P2）

| ID／狀態 | 工程入口與工作 | 驗收與邊界 |
| --- | --- | --- |
| **R12 DOCS_DONE / regression pending** | `doc/todo.md`、`doc/acceptance.md`、`doc/wbs.md` 與 P0-V/CI runbook 已收斂現況；新增回歸護欄避免歷史 OPEN 覆蓋正式 PASS。 | 檔案連結及狀態一致性測試 PASS、exact-head CI；**僅文件缺陷可結案，不等於產品發布** |
| **R13 OPEN** | 舊 Cloud Build YAML/Triggers、AR/GCS 清單：GCP metadata 唯讀盤點；各筆按 owner、仍被引用的 image/job、backup／應用資料分類。 | 未知依賴不刪；任何資產刪除另需批准、backup 保護、刪前／刪後 readback |
| **R14 OPEN** | `omni_chat` hot state 實際成長分析；owner-bound GCS artifacts、Iceberg 非同步 archive，BigLake/BigQuery 保持成本核准門。 | 冪等、快照保留與 reconciliation、Owner 隔離、資料可還原；不得把歷史 archive 當即時狀態權威 |

## 推進與關閉規則

1. **所有 16 項均有單獨的 code/API/infra 入口、測試與驗收退出條件**。原始稽核保留證據和風險判定，本表負責工程執行順序，`doc/todo.md` 負責當前優先級。
2. 每項驗收證據需有 `risk_id`、`source_sha`、`tests`、`CI`、`candidate/release`、`runtime_readback`、`owner_scope`、`outcome`；沒有某層就標 PARTIAL。
3. 安全/付費模型/正式流量/IAM/Secret 變更採**最小範圍另案核准**。不得跨專案 repo/資料庫操作，也不要求使用者人工執行 Google OAuth 驗收。
4. CI 的 `success`、歷史單 Owner Preview、Consumer 回報或 文件 commit 均不能代替全產品發布結案。
