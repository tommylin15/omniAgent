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

## 第一批 P0 安全實作收據（2026-10-15）

本段是**已提交原始碼及受測功能**，不是已取得正式安全驗收。實作來源 SHA 以最新 GitHub main 為準：

- R02：新增 `owner_authorization.ts`；Gateway Gemini 設定 `GEMINI_SHARED_REQUIRE_OWNER_AUTHORIZATION=true`、每消費端各自 HMAC key 時，驗證 project／ownerId／requestId／audience／60 秒內簽章；Shared Codex 提供等價受控設定。匿名、錯誤 project、偽造 Owner、過期證明拒絕；**尚未於三個正式消費端啟用／讀回其 DB 授權收據，因此風險保持 OPEN**。
- R03：新增 `CHAT_DATABASE_TLS_MODE=verified-ca`，需要 `CHAT_DATABASE_CA_PEM` 與私有 IP DB 使用的 `CHAT_DATABASE_TLS_SERVERNAME`；在 Node PostgreSQL driver 強制 `rejectUnauthorized:true`。現有 `private-self-signed` 為待遷移的明確風險，不聲稱已修正 live DB 連線。
- R15：歷史 project-wide IAM bootstrap 預設 fail-closed，需明確 `OMNIAGENT_APPROVE_LEGACY_PROJECT_WIDE_IAM=yes` 才可執行 `grant`；不修改現行 GCP IAM。實際 role bindings 的唯讀比對仍需 runtime 證據。
- R01／R04／R05：模型全域配額、跨 Owner live E2E、Cost receipt 與正式 Chat Dispatch 均未達退出條件，**維持 OPEN／OFF**。

上述權限證明使用的簽章 key 必須從 Secret Manager 或同等安全儲存提供，不得 commit 真實 key，也不可記錄 token／prompt。消費端應先驗證真正的登入者與其 DB Owner mapping 再簽章；單純簽章不能取代該消費端的終端使用者授權。

## 第二批 P0 實作（持久化配額及簽章綁定）

- R04：新增 `infra/postgres/migrations/006_gateway_model_quota.sql` 與 `model_quota_ledger.ts`，將 requestId 永久冪等收據、project/owner/global 每日呼叫數與保守 token 預留、全域同時執行數放在**獨立 Gateway PostgreSQL 資料庫**。PostgreSQL transaction advisory lock 保證不同 Cloud Run instance 同時請求只能按順序預留；完成／失敗／不確定結果均不退還計量、相同 requestId 不重送 Provider。帳本只存 prompt SHA256，不存 prompt 文字。
- R02：Owner HMAC v2 額外綁定 model 與 prompt SHA256；Gateway 的 `GEMINI_SHARED_QUOTA_ENABLED=true` 必須同時啟用 `GEMINI_SHARED_REQUIRE_OWNER_AUTHORIZATION=true`，反之亦然，避免只開簽章而未設資料庫重放防護。獨立 Shared Codex 尚未完成持久化防重放，因此仍維持 R02 OPEN。
- 正式啟用的必要配置：專用 Ledger PostgreSQL 執行 migration 006，使用有憑證驗證的 `GEMINI_SHARED_LEDGER_DATABASE_URL`、`GEMINI_SHARED_LEDGER_CA_PEM`、必要時 `GEMINI_SHARED_LEDGER_TLS_SERVERNAME`；`GEMINI_SHARED_QUOTA_LIMITS_JSON` 必須包括七項嚴格正整數額度。**本次未核准建 DB、IAM、Secret 或啟用 Gateway flag**；在這些 runtime readback 缺席前不得宣告 R04 DONE。
- 這些 token 預留使用 prompt UTF-8 byte 數加 maxOutputTokens，屬**保守容量上限**，不應宣稱等同供應商實際費用／美元預算。真正費用上限還需要 Billing/Monitoring 與實際 usage 對帳。

## 第三批 R01 Chat 真實路徑配額
- **重要**：R04 先前共享端點 `/v1/gemini/execute` 的 Ledger 不覆蓋 omniAgent Chat 使用的 `/internal/v1/assistant/turn`。因此新增獨立 `007_chat_model_dispatch_budget.sql` 與 `services/chat-api/dispatch_budget.ts`，直接在 `ChatStore.claimNextQueuedTurn` 的既有 `QUEUED→RUNNING` 交易內，對 Gemini／OpenRouter 的全域併發和每日 global/Owner 呼叫／保守容量額度做不可退還預留。
- 每個 Chat dispatch **必須**配置 `CHAT_DISPATCH_BUDGET_JSON` 的六項嚴格正整數上限，否則啟用時直接拒絕啟動；現有未啟用的 Chat 與 Codex 三回合保護維持原狀。僅限 Chat 自有 DB 的模型預算資料；不承諾等同真實美元計費。
- CI 使用兩個獨立 PostgreSQL Pool 同時 claim 不同 Owner，驗證 global 並發門、Owner 限額及不可重試；CI PASS 僅證明 fixture 邏輯，不代表正式 owner OAuth/token、Cloud Run Gateway IAM、實際 quota migration 或 terminal DB readback PASS。

## R01 fail-closed 啟用條件
- 當 `CHAT_DISPATCH_ENABLED=true` 時，Chat 必須使用 `CHAT_DATABASE_TLS_MODE=verified-ca`，並同時提供受信任 CA 與驗證主機名；否則啟動即失敗。非正式舊自簽 TLS 仍可供 **Dispatch OFF** 既有流量使用，不能據此授權正式推論。
- `GET /ready` 會檢查 `omni_chat.model_daily_budgets` 在 DB 中可查詢，避免 migration 007 尚未實際部署卻因 `SELECT 1` 成功誤認已可 dispatch。
- 本次源碼測試與部署都無法取代 CA、專用資料庫權限、模型呼叫 entitlement、合法使用者 token、正式 Chat→Gateway IAM 等端點讀回。

## R01 PostgreSQL TLS 封閉式候選驗收準備
- 2026-10-15 獨立 GCP 唯讀證據：`omniagent_chat` migration 007 已驗證、原本核准的 OAuth-backed Owner DB 對應 PASS。Gateway service-level invoker 有 Chat runtime SA，並非公開呼叫端；PostgreSQL `ssl=on`，使用有效的自簽伺服器憑證，CN 與私有 VM 主機名稱一致。這些只說明有技術途徑，不代表 TLS 已在 Chat candidate 握手 PASS。
- 新增 `CHAT_DATABASE_CA_BASE64`（與 `CHAT_DATABASE_CA_PEM` 互斥），允許將**公開憑證**用單行 Cloud Run env 注入，仍經 `verified-ca` 完成憑證鏈及主機名驗證；禁止把 Secret 或私鑰作為這個值。候選來源應從已授權基礎設施取得公開 cert，不能盲信用戶輸入的字串。
- `R01` 正式推論仍需 0%-traffic TLS/ready、Owner model entitlement、經授權服務身分 Chat→Gateway 呼叫、實際 provider 回應、DB terminal readback；**不得**因 migration 或單次 ready PASS 就宣稱 DONE。
