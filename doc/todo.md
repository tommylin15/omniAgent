# omniAgent 唯一有效 TODO（2026-10-14）

本文件只追蹤**現行狀態及未結工程**。歷史測試、取消的方案、舊 Revision 數量、曾經失敗的診斷請從 Git history／Actions 追溯，**不可用歷史 OPEN 覆蓋新的 runtime PASS**。以正式 GCP runtime 和對應 GitHub SHA 為準；完整產品狀態仍為 **PARTIAL**。

## 已完成（附 runtime 證據）

- [x] **P0-V Gateway Gemini 正式啟用**：[受控發布 #38559065522](https://github.com/tommylin15/omniAgent/actions/runs/38559065522)：三種 caller 的 signed Gemini 正向／跨專案負例與正式 Gateway 路由。
- [x] **三服務正式 Cloud Run／IAM 讀回**：[獨立驗收 #38498845455 attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/38498845455/attempts/3)：Chat `00069-tep`、Gateway `00076-pog`、Shared Codex `00046-naj` 各 Ready 且有單一 100% 正式流量；Gateway／Shared 不開放匿名。
- [x] **每個服務保留 10 個 Revision**：[實際清理 #38574373341](https://github.com/tommylin15/omniAgent/actions/runs/38574373341) 刪除 31 個舊 revisions 和 31 個舊 tagged routes；獨立 readback 10／10／10。這是當次快照，不代表後續新候選永遠維持 10。
- [x] **Owner Chat Preview 單回合 Gemini**：Owner 回報正常回覆及重整後歷史保留；[PostgreSQL readback #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212) 一筆 durable COMPLETED。**只在單 Owner Preview 範圍 PASS**。
- [x] **Life、market-mart P0-V 技術交接**：各消費端回報串接通路成功（`CONSUMER_REPORTED_PASS`）；不是 omniAgent 獨立讀取其 production DB/schema receipt。
- [x] **Gateway 限額與失敗分類**：market-mart 32 KiB Prompt／2,048 輸出 tokens；Chat／Life 8 KiB／512；上游 429／503／504 分類，不自動付費重試。

## 2026-10-15 R01 受控實測（僅限候選後端）

- **R01 真實 Gemini backend inference PASS（單 Owner／0% traffic）**：[驗收 #38742807230](https://github.com/tommylin15/omniAgent/actions/runs/38742807230)；source SHA `67cabc2dec6474453c9d9000fcc29290c75e4bd5`。verified PostgreSQL TLS、Owner 身分、候選限定 signed caller、匿名拒絕與正式 template 還原 PASS；僅一筆 Chat dispatch→Gateway→Gemini 推論，SQL terminal／文字事件／非零 provider usage 驗收 gate PASS。
- **正式 Chat Dispatch 仍 OFF，整體產品仍 PARTIAL**。這次測試未切正式流量，亦不代表兩 Owner 授權負例、UI 真實操作及重整、SSE／復原或正式模型發布已完成。
- R01 未使用付費失敗自動重試；除已封存的一次性核准候選外，不應再次消耗此 source SHA 的 fixture。

## 2026-10-15 R05/R08 安全與重送工程驗收

- **R05 CI 雙 Owner 邊界回歸 PASS，正式雙人 OAuth API E2E 仍 NOT_VERIFIED**：[`ceb591e8`](https://github.com/tommylin15/omniAgent/commit/ceb591e8160371041638d730af3a8fe276adda6a) 擴充真實本地臨時 PostgreSQL＋兩組分離的測試 verifier，覆蓋 thread、turn receipt、events/SSE、fork、message、approval、cancel、delete 的跨 Owner 拒絕。測試 verifier **不是** Google OAuth Token。
- **R05 正式資料庫只讀盤點 PASS**：[Actions #38744815240](https://github.com/tommylin15/omniAgent/actions/runs/38744815240)；`omniagent_chat` 有 3 筆 OAuth issuer/subject mapping、3 名 Owner 曾建對話、1 名 Owner 有事件；未存取其它邏輯資料庫、未修改任何使用者資料、未取得合法雙使用者 OAuth Token。正式雙 Owner API E2E 與模型授權隔離仍 **NOT_VERIFIED**，不可開正式 Dispatch。
- **R08 Flutter 同一 POST 意圖的結果不明重送防護已合併並通過 CI**：[`17be5669`](https://github.com/tommylin15/omniAgent/commit/17be56692343da3fa2f904f8233f7bbca522e348) 保留原 UUID idempotency key，含網路逾時／HTTP 2xx 回應格式錯誤；成功確認後才能產生新鍵；不同 ChatApi 登入工作階段隔離。瀏覽器重載／跨裝置 durable retry 與故障注入 live E2E 尚未驗收，仍 **PARTIAL**。
- **本批相同 source SHA 對應完整 Quality／GHCR／0% Cloud Run／candidate Smoke PASS**：[Quality＋Image #38745320738](https://github.com/tommylin15/omniAgent/actions/runs/38745320738)、[0% 候選 #38746078817](https://github.com/tommylin15/omniAgent/actions/runs/38746078817)、[Smoke #38746293889](https://github.com/tommylin15/omniAgent/actions/runs/38746293889)、[runtime 唯讀 #38746406671](https://github.com/tommylin15/omniAgent/actions/runs/38746406671)。GitHub workflow SUCCESS 但無明確 one-shot marker 的 release/R01 步驟是 **NOT_RUN**，不可視為再次啟用或推論。

## 2026-10-15 R05／R08 最新增量驗收

- **R08 歷史回覆恢復及不完整 2xx 回應修復，候選驗收 PASS（有限範圍）**：source [`36869a67`](https://github.com/tommylin15/omniAgent/commit/36869a6752a13237c8ff8320577288e3c18b404e)。從 Owner-scoped SSE 歷史事件辨識已完成回合，重新查詢 PostgreSQL turn receipt，而不是在重整後重送 Gemini；對 POST 2xx 缺少 thread/turn ID 的不確定結果保留原請求 UUID。Flutter [#38747561873](https://github.com/tommylin15/omniAgent/actions/runs/38747561873)、GHCR [#38747560916](https://github.com/tommylin15/omniAgent/actions/runs/38747560916)、Cloud Run 0% [#38748245149](https://github.com/tommylin15/omniAgent/actions/runs/38748245149)、Smoke [#38748485790](https://github.com/tommylin15/omniAgent/actions/runs/38748485790) PASS。仍缺跨裝置 durable retry、正式授權 UI 操作及網路故障 live E2E。
- **R05 正式 Cloud Run 無效 Token／偽造 Owner 邊界 PASS（負向 only）**：source [`77ce4d02`](https://github.com/tommylin15/omniAgent/commit/77ce4d025ba7c93b08ae4155b2318141a819999d)，[live negative #38749705630](https://github.com/tommylin15/omniAgent/actions/runs/38749705630)。最新 GHCR [#38748853426](https://github.com/tommylin15/omniAgent/actions/runs/38748853426)、0% [#38749298181](https://github.com/tommylin15/omniAgent/actions/runs/38749298181)、Signed Smoke [#38749573831](https://github.com/tommylin15/omniAgent/actions/runs/38749573831) PASS；八種匿名／無效 JWT／Owner header spoof／無效寫入／內部身分拒絕均為 HTTP 401，正式流量保持不變，無模型呼叫。**雙真實 Google 使用者的合法 token/API 正向＋跨 Owner 負向仍 NOT_VERIFIED_NO_DELEGATED_USER_TOKENS**，不應視為 R05 DONE。
- 無 one-shot marker 的 R01、formal release 等 workflow 雖顯示 SUCCESS，其推論／正式發布動作是 **NOT_RUN**，不能誤報為再次真實推論或正式 Chat Dispatch 上線。

## 2026-10-16 R08 跨工作階段／跨裝置回合恢復

- **R08 Owner-scoped latest-turn API + Flutter 恢復：CI／0%-traffic candidate PASS，正式 user E2E PARTIAL**。實作 [`a6766bff`](https://github.com/tommylin15/omniAgent/commit/a6766bfff467a78a7b78a044ac9ed5f1361eae02)，Flutter lint 修正 [`93f14edb`](https://github.com/tommylin15/omniAgent/commit/93f14edb86425e18986904992089d1386a417cf7)。新增 `GET /v1/threads/{threadId}/turns/latest`，從 `omni_chat.turns` 僅以 verified Owner + thread 讀最新 turnId/status；不外洩 prompt、idempotency key 或 provider native handle。Flutter 跨瀏覽器／裝置開啟既有對話時，透過 read-only API + 原有 receipt endpoint 重新驗證最後已完成回合；不發送 message POST。
- **同 SHA 完整驗收**：Flutter tests/build [#38821023496](https://github.com/tommylin15/omniAgent/actions/runs/38821023496) PASS、GHCR Quality/3 Images [#38821023533](https://github.com/tommylin15/omniAgent/actions/runs/38821023533) PASS、Cloud Run 0% [#38821656675](https://github.com/tommylin15/omniAgent/actions/runs/38821656675) PASS、Signed Smoke [#38821797192](https://github.com/tommylin15/omniAgent/actions/runs/38821797192) PASS、R05 invalid-user live [#38821885123](https://github.com/tommylin15/omniAgent/actions/runs/38821885123) PASS、Owner runtime readonly [#38821885055](https://github.com/tommylin15/omniAgent/actions/runs/38821885055) PASS、production readiness audit [#38821885173](https://github.com/tommylin15/omniAgent/actions/runs/38821885173) PASS。
- **未完成**：跨裝置不確定寫入意圖的 durable ID 鍵同步、完整長對話歷史快速讀取、正式合法兩位 Google user OAuth E2E／故障注入；不可宣稱 R08 全部 DONE 或以這次驗收取代 R05。R01 真實單 Owner backend PASS 不需重跑；此批沒有再呼叫 Gemini、切正式流量或開 `CHAT_DISPATCH_ENABLED`。

## P0 — 最優先待辦

**R01–R16 風險已逐項轉為工程包與驗收退出條件**：[風險修復計畫](../docs/risk-remediation-plan.md)。規劃已完成 ≠ 修復已完成；P0 工作必須依安全、成本、兩 Owner E2E 及正式發布 gate 分批執行。

| ID | 工作 | 現況 | 完成條件 |
| --- | --- | --- | --- |
| 01 | 正式 Chat Gemini Dispatch 受控開啟 | **OFF／OPEN** | Owner entitlement、cost cap、Secret、signed Gateway、正式安全正負例、fallback 與配置讀回 |
| 02 | Chat→Gateway→PostgreSQL→UI 正式模型回覆 | **PARTIAL；R01 0%-traffic 單 Owner 真實 Gemini 後端 PASS** | 後端已取得單次實際推論與 PostgreSQL terminal／Token usage 收據；仍需正式 Dispatch 啟用、多 Owner、UI 重整與同 requestId 讀回 |
| 03 | 兩個 Owner 的權限隔離 | **CI fixture PASS／LIVE USER E2E NOT_VERIFIED** | 合法雙 Google 使用者自動化 OAuth token 的正向與跨 Owner thread/event/credential/SSE 負向測試 |
| 04 | SSE、Approval、Cancel、重連、冪等及崩潰恢復 | **PARTIAL** | 具故障注入、同 SHA source/test/live E2E |
| 05 | Codex Owner 專屬 session/workspace/authorization/terminal | **PARTIAL** | 真實 Owner 隔離與 provider→DB 回路，預算內受控驗收 |
| 06 | Life 與 market-mart 正式消費端證據核對 | **PARTIAL** | 消費端自行提供 release/requestId/schema/DB receipt，不越界讀別專案 DB |
| 07 | Flutter 桌機／手機／長對話／錯誤與無限 loading | **PARTIAL** | 實際部署／響應式／回歸驗收 |
| 08 | 全套 CI/CD、正式發布與恢復驗收 | **PARTIAL** | exact SHA→Node/Python/Flutter→GHCR→0% candidate→live gate→production readback |

**安全界線**：人工 Google OAuth 登入及 A→B→A 人工驗收已取消（`NOT_REQUIRED`），但可自動化的 JWT issuer/audience/subject、匿名拒絕、IAM／跨 Owner 安全檢查必須保留。Gateway Gemini 正式 ON **不代表** Chat 正式 Dispatch ON（獨立讀回 `CHAT_DISPATCH_ENABLED=false`）。

## P1 — Provider／憑證／Tools

- [ ] BYOK Secret Manager create/replace/revoke、reconciliation、UI、migration003/IAM 正式驗收。管理功能預設 OFF。
- [ ] 完成 Credential Resolver：Owner + provider + 個人／平台 credential + entitlement，防止跨 Owner context。
- [ ] OpenRouter 正式 Chat provider→DB E2E；Groq **已有 adapter source**，仍缺正式 Chat dispatch／UI wiring 與實際驗收。
- [ ] MCP／Tools／Skills 的授權、執行、Approval、安全負例及實際日誌證據。
- [ ] 按 [風險修復計畫 R01–R16](../docs/risk-remediation-plan.md) 補齊 TLS、全域配額、Secrets rotation、歷史發布入口、重試冪等與 IAM 最小權限的實作／CI／runtime 收據。

## P2 — 資料與長期產品

- [ ] GCS owner-bound artifact tier：先以真實流量測量 hot PostgreSQL 和大型 payload 門檻。
- [ ] Iceberg 非同步封存、事件／工具／成本稽核及 source/archive reconciliation（不取代 PostgreSQL 即時狀態）。
- [ ] BigLake／BigQuery 需另經資源／成本核准。
- [ ] Twin Beast 生產素材、UI accessibility／手機版完整視覺驗收。
- [ ] 整理剩餘歷史 Cloud Build／AR／GCS 依賴及停用狀態；只清理有明確資產所有權和備份保護的項目。

## 不可誤判的工作規則

`WORKFLOW_SUCCESS` 若主要步驟 `SKIPPED`，不算部署成功。Consumer 回報 PASS 不算我們獨立核對它的 DB。某個 Preview 的單 Owner 回覆 PASS 不代表兩 Owner 正式產品 PASS。任何對數值、權限、費用與正式流量的變更，必須重新取得 runtime 證據。

**來源**：[驗收矩陣](acceptance.md) · [WBS](wbs.md) · [Gateway P0-V 合約](../docs/shared-gemini-vertical-slice.md) · [Actions](https://github.com/tommylin15/omniAgent/actions)。
