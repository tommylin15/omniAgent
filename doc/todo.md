# omniAgent 唯一有效 TODO（2026-10-14）

本文件只追蹤**現行狀態及未結工程**。歷史測試、取消的方案、舊 Revision 數量、曾經失敗的診斷請從 Git history／Actions 追溯，**不可用歷史 OPEN 覆蓋新的 runtime PASS**。以正式 GCP runtime 和對應 GitHub SHA 為準；完整產品狀態仍為 **PARTIAL**。

## 已完成（附 runtime 證據）

- [x] **P0-V Gateway Gemini 正式啟用**：[受控發布 #38559065522](https://github.com/tommylin15/omniAgent/actions/runs/38559065522)：三種 caller 的 signed Gemini 正向／跨專案負例與正式 Gateway 路由。
- [x] **三服務正式 Cloud Run／IAM 讀回**：[獨立驗收 #38498845455 attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/38498845455/attempts/3)：Chat `00069-tep`、Gateway `00076-pog`、Shared Codex `00046-naj` 各 Ready 且有單一 100% 正式流量；Gateway／Shared 不開放匿名。
- [x] **每個服務保留 10 個 Revision**：[實際清理 #38574373341](https://github.com/tommylin15/omniAgent/actions/runs/38574373341) 刪除 31 個舊 revisions 和 31 個舊 tagged routes；獨立 readback 10／10／10。這是當次快照，不代表後續新候選永遠維持 10。
- [x] **Owner Chat Preview 單回合 Gemini**：Owner 回報正常回覆及重整後歷史保留；[PostgreSQL readback #38381669212](https://github.com/tommylin15/omniAgent/actions/runs/38381669212) 一筆 durable COMPLETED。**只在單 Owner Preview 範圍 PASS**。
- [x] **Life Assistant → omniAgent → Gemini → Life DB／業務流程完整 E2E：使用者確認 PASS（2026-10-16）**。使用者明確確認 Life 連線、Gemini 真實推論、Life 資料庫回寫及完整業務流程均已通過；這是 **USER_CONFIRMED_E2E_PASS**，不再將 Life 的業務鏈視為待修復阻塞。此輪沒有提供可由 omniAgent 獨立讀回的 requestId、Life release／DB receipt，證據層級是使用者確認，非 omniAgent 自有的獨立 runtime audit。market-mart 的驗收證據仍獨立追蹤。
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

## 2026-10-16 R05 真實雙 Google Owner 自動化驗收工程

- **真實雙人驗收程式、CI、0%-traffic 候選已具備，合法 Token gate 仍 BLOCKED（未完）**。實作 [`380cbf89`](https://github.com/tommylin15/omniAgent/commit/380cbf8900edccf8d511d97acd54b6514246a9fb)：以兩組分離的合法 Google 使用者 ID Token 經既有 Chat 服務 verifier 取得不同 DB Owner ID，再受控建立／刪除專屬測試 Thread；驗證跨 Owner GET/SSE/active/latest/DELETE 均 404、偽造 Owner header 無效；禁止模型推論、訊息 POST、BYOK，任一清理失敗即阻擋。不把 fixture 或 SA Token 冒充真人驗收。
- **工程與 CI PASS**：R05 harness 5/5 單元測試通過；Node [#38826887354](https://github.com/tommylin15/omniAgent/actions/runs/38826887354)、Project Hygiene [#38826887355](https://github.com/tommylin15/omniAgent/actions/runs/38826887355)、完整 Quality＋三服務 GHCR [#38826887271](https://github.com/tommylin15/omniAgent/actions/runs/38826887271)、Cloud Run 0% [#38827183809](https://github.com/tommylin15/omniAgent/actions/runs/38827183809)、Signed Smoke [#38827335254](https://github.com/tommylin15/omniAgent/actions/runs/38827335254)、R05 invalid-user live [#38827442185](https://github.com/tommylin15/omniAgent/actions/runs/38827442185) 全 PASS。
- **真實 Google 雙使用者 E2E NOT_VERIFIED（有收據）**：[獨立 workflow #38826887437](https://github.com/tommylin15/omniAgent/actions/runs/38826887437) 正確 fail-closed；artifact readback：`r05_blocker=NO_TWO_DELEGATED_GOOGLE_USER_TOKENS_CONFIGURED`、`r05_two_user_live_auth_boundary=NOT_VERIFIED`。沒有 Google 使用者 Token 就不執行匿名身分替代，不用假綠燈；正式 Chat Dispatch 仍 OFF。下一步只缺安全可授權的雙 Google user ID Token（短期 Token 有到期限制，長期完全無人值守仍須合法 OAuth 授權機制）。[操作與安全規格](../docs/r05-real-two-owner-automation.md)。

## 2026-10-16 R05 Google-signed IAM Service Account 防偽身分修復與真實負向驗收

- **修復來源** [`8d2f8222`](https://github.com/tommylin15/omniAgent/commit/8d2f8222d24e229d40a039d60822f81cbc60227a)：Google OAuth user verifier 在 Google 簽章／audience／效期驗證後，額外檢查 `email_verified`、email 非服務帳號網域、`azp` 具有 Google OAuth client 格式（若存在）。IAM service account ID token 不得建立 browser Owner；既有 internal service verifier 不改。
- **CI／0% Cloud Run candidate PASS**：Node [#38851175381](https://github.com/tommylin15/omniAgent/actions/runs/38851175381)、全 Quality＋3 GHCR [#38851175290](https://github.com/tommylin15/omniAgent/actions/runs/38851175290)、0% candidate [#38851581074](https://github.com/tommylin15/omniAgent/actions/runs/38851581074)、Signed Smoke [#38851688846](https://github.com/tommylin15/omniAgent/actions/runs/38851688846)、R05 runtime [#38851741897](https://github.com/tommylin15/omniAgent/actions/runs/38851741897)、production readiness read-only [#38851741804](https://github.com/tommylin15/omniAgent/actions/runs/38851741804) PASS。
- **GitHub Action artifact 原始 401 收據**：`r05_signed_sa_user_me/models/threads/events/latest=PASS_401` 全 5 項；此外原有匿名／無效 JWT 8 項 PASS_401、`r05_formal_traffic_unchanged=PASS`、`r05_model_provider_calls=ZERO`。IAM minted token 的 subject 不是合法真人 Google OAuth，不得偽稱雙 Owner 已驗收。
- **正式雙 Google user E2E：NOT_VERIFIED**。`R05_OWNER_A_GOOGLE_ID_TOKEN` 與 `R05_OWNER_B_GOOGLE_ID_TOKEN` 仍無合法可用的自動化授權來源（上一輪獨立 Gate [#38826887437](https://github.com/tommylin15/omniAgent/actions/runs/38826887437) 明確 fail-closed）。真人操作驗收政策維持取消；保留自動 JWT/Owner 隔離 gate。正式 Chat Dispatch OFF，無正式 traffic promotion，也沒有觸發 Gemini 推論。

## 2026-10-16 R08 原始訊息 Idempotency-Key／PostgreSQL 唯讀回合核對

- **增量成果：CI／0% 候選 PASS；完整 R08 仍 PARTIAL**。實作 [`ceada71b`](https://github.com/tommylin15/omniAgent/commit/ceada71bd93028f6d6c7425d2f94a369e4ca2c3b) 與修正後合格 SHA [`1ed7b379`](https://github.com/tommylin15/omniAgent/commit/1ed7b37923be7d6e30e3a7a91f8a59292985d67c)。新增 `GET /v1/threads/{threadId}/turns/reconcile`，讀取原始 `Idempotency-Key` 請求標頭，依已驗證 Owner 從 PostgreSQL `omni_chat.turns` 回傳僅 `turnId,status`，無提示詞或 provider payload。回合不存在只代表 **目前尚未查到**，不表示先前 POST 一定失敗。
- Flutter 在原登入／原 ChatApi session 的 `/messages` POST 回應不確定時，改先唯讀呼叫 reconcile；若有已提交回合，恢復 turnID、階段、Owner SSE 和 DB receipt，不重送訊息；若查無或讀取失敗則保留原 Key，不以新 Key 自動推論。不能把此項認定為跨重新登入／跨裝置共享原 Key：`ChatApi` 的 pending Key 目前僅在記憶體中，登出清除。
- **可重跑驗收**：Node Core [#38853748160](https://github.com/tommylin15/omniAgent/actions/runs/38853748160) PASS（該次早期 SHA）；最終來源 `1ed7b379` 的 Flutter [#38853888114](https://github.com/tommylin15/omniAgent/actions/runs/38853888114) PASS、Quality/3 GHCR [#38853888080](https://github.com/tommylin15/omniAgent/actions/runs/38853888080) PASS、0% Cloud Run [#38854466487](https://github.com/tommylin15/omniAgent/actions/runs/38854466487) PASS、Signed Smoke [#38854586006](https://github.com/tommylin15/omniAgent/actions/runs/38854586006) PASS、R05 runtime negative [#38854635306](https://github.com/tommylin15/omniAgent/actions/runs/38854635306) PASS、production readiness [#38854635332](https://github.com/tommylin15/omniAgent/actions/runs/38854635332) PASS。沒有新 Gemini 實測，也未切正式流量。
- **後續 R08**：需明確設計不留 raw prompt/token、Owner 分區且登出銷毀的瀏覽器／裝置 pending-Key 狀態，必要時可用安全的裝置復原流程；別假設新裝置知道舊裝置的 Key。驗收必須涵蓋跨重新整理、換裝置、對同一內容有意重送的區分及網路競態。R05 兩合法 Google user Token 同樣未補齊。

## 2026-10-16 R08 Owner 分區 pending-key／同分頁重載恢復與故障注入

- **實作 PASS（有限範圍）**：正式候選來源 [`be6e7401`](https://github.com/tommylin15/omniAgent/commit/be6e7401a32c7d046450f57c0b4d24b417d358f1)，新增 Flutter Web `package:web` 的 `sessionStorage` Owner 分區記錄。只有在 `/v1/me` 經 Google OAuth 已由後端驗證並映射 Owner UUID 之後，才會載入該 Owner 的 pending keys。每個 Thread 僅保存原始 UUIDv4 Key、Thread ID 與 schema version，不寫入提示詞、Token、provider response 或 DB payload；儲存失敗／毀損時 fail closed，寫入請求前**必須先保存原 Key**。
- Flutter 遇 HTTP 回應遺失，原 Key 可跨**同一分頁重新整理**保留；讀回 `/v1/threads/:id/turns/reconcile` 有既有回合時，清除本機 pending、繼續 SSE／DB receipt，無額外 POST／Gemini；查無回合仍保留原 Key、停用此 Thread 新訊息輸入，等待後續唯讀輪詢。不會用新 Key 推測失敗或自動再執行。後端明確 `503 dispatch_unavailable`（前置權限 gate，確知 DB 未提交）才安全清除 pending。登出／切換到不同 Owner 時清理前者本機 metadata；同 Owner 刷新授權保留。
- **故障注入 CI PASS（mock network／真 PostgreSQL owner boundary 分開驗收）**：Flutter MockClient 模擬「已寫入 DB 但 202 回覆遺失」→ reload 原 Key GET 返回相同 turn、不重新 POST、「前一次仍在處理」→ 初次 GET null、新 POST fail-closed、延遲回合成功讀回、切換 Owner、登出、Storage denied／corrupt、明確 503 零提交；原有完整 PostgreSQL Owner 及 message-key idempotency tests 亦在 Quality PASS。**這不是 Google 真實使用者的現場網路故障 E2E**。
- **實際 CI／候選**：Flutter Analyze＋Widgets＋Web [#38856472000](https://github.com/tommylin15/omniAgent/actions/runs/38856472000) PASS，完整 Quality／三 GHCR Images [#38856472014](https://github.com/tommylin15/omniAgent/actions/runs/38856472014) PASS，0% Cloud Run candidate [#38856846223](https://github.com/tommylin15/omniAgent/actions/runs/38856846223) PASS，Signed Smoke [#38856962371](https://github.com/tommylin15/omniAgent/actions/runs/38856962371) PASS，R05 invalid-user boundary [#38857026589](https://github.com/tommylin15/omniAgent/actions/runs/38857026589) PASS，Owner runtime read-only [#38857026582](https://github.com/tommylin15/omniAgent/actions/runs/38857026582) PASS、production audit [#38857026623](https://github.com/tommylin15/omniAgent/actions/runs/38857026623) PASS。正式 Chat Dispatch OFF、0% 候選未切流。
- **R08 總結仍 PARTIAL**：`sessionStorage` 限同一瀏覽器分頁；新分頁／關閉分頁／換裝置不共享 Key，Flutter 非 Web 只有記憶體 fallback。尚缺合法 Google user 真實端到端故障注入、跨裝置恢復設計、同一裝置異分頁及長期保留策略。R05 合法雙 Owner Google OAuth E2E 仍 NOT_VERIFIED。

## P0 — 最優先待辦

**R01–R16 風險已逐項轉為工程包與驗收退出條件**：[風險修復計畫](../docs/risk-remediation-plan.md)。規劃已完成 ≠ 修復已完成；P0 工作必須依安全、成本、兩 Owner E2E 及正式發布 gate 分批執行。

| ID | 工作 | 現況 | 完成條件 |
| --- | --- | --- | --- |
| 01 | 正式 Chat Gemini Dispatch 受控開啟 | **OFF／OPEN** | Owner entitlement、cost cap、Secret、signed Gateway、正式安全正負例、fallback 與配置讀回 |
| 02 | Chat→Gateway→PostgreSQL→UI 正式模型回覆 | **PARTIAL；R01 0%-traffic 單 Owner 真實 Gemini 後端 PASS** | 後端已取得單次實際推論與 PostgreSQL terminal／Token usage 收據；仍需正式 Dispatch 啟用、多 Owner、UI 重整與同 requestId 讀回 |
| 03 | 兩個 Owner 的權限隔離 | **CI fixture PASS／LIVE USER E2E NOT_VERIFIED** | 合法雙 Google 使用者自動化 OAuth token 的正向與跨 Owner thread/event/credential/SSE 負向測試 |
| 04 | SSE、Approval、Cancel、重連、冪等及崩潰恢復 | **PARTIAL** | 具故障注入、同 SHA source/test/live E2E |
| 05 | Codex Owner 專屬 session/workspace/authorization/terminal | **PARTIAL** | 真實 Owner 隔離與 provider→DB 回路，預算內受控驗收 |
| 06 | Life／market-mart 消費端驗收 | **Life USER_CONFIRMED_E2E_PASS；market-mart 獨立收據 PARTIAL** | Life 2026-10-16 已由使用者確認連線→Gemini 推論→Life DB 回寫→完整業務流程，毋須重跑業務流程；僅在跨專案稽核需要時補對應 requestId／release／DB receipt。market-mart 證據由自身消費端管理，不越界讀其它專案 DB |
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

## AI Router 戰情室（RUA）

- [x] **RUA-01｜統計讀取／API／Flutter UI／權限測試（CODE+CI PASS）**：[exact SHA `6bf1c28` 的完整 CI Node／Flutter／Postgres](https://github.com/tommylin15/omniAgent/actions/runs/38990748520) **全部 PASS**；包含實際 PostgreSQL 聚合、Owner 權限負例、缺值與分來源計數、Owner 排行及 Flutter widget。**僅標記 CODE+CI，正式部署／真實 Owner 讀回仍為 RUA-02 OPEN**。資料口徑參考 [戰情室契約](../docs/ai-router-analytics.md)。
- [ ] **RUA-02｜正式資料來源接線與驗收**：以管理員 verified Owner UUID 啟用 `ROUTER_USAGE_ENABLED`、配置專用唯讀 Gateway 帳本 DB 憑證與 verified TLS；測試一般 Owner 403／管理員 200、真實多專案資料、手機操作、API latency，並以 Cloud Run 同 SHA 讀回。**未設定 Gateway 帳本時 UI 必須報缺，不能當 0 次**。
- [ ] **RUA-03｜所有 Provider 統一執行帳本**：後續各 provider 實際 invocation 採獨立唯一 ID 串接 Chat turn、token split、耗時與錯誤；唯一鍵去重、前置拒絕另計，才允許跨來源去重總量。
- [ ] **RUA-04｜成本與預警**：需可驗證實際 token/單價/計費來源才推出成本；用量異常與預警列 P2，不增加過早依賴。

### RUA-02 驗收與發布證據更新（2026-10-17）
- **RUA-01 同一 SHA 發布證據**：[CI #38990748520](https://github.com/tommylin15/omniAgent/actions/runs/38990748520) Node、Flutter、PostgreSQL **PASS**；[GHCR #38990748509](https://github.com/tommylin15/omniAgent/actions/runs/38990748509) 三映像 PASS；[0%-candidate #38991162650](https://github.com/tommylin15/omniAgent/actions/runs/38991162650) PASS；[Smoke #38991272976](https://github.com/tommylin15/omniAgent/actions/runs/38991272976) PASS。
- [ ] **RUA-02 live**：[Auto Release #38991332177](https://github.com/tommylin15/omniAgent/actions/runs/38991332177) readiness 與 production promotion steps PASS；**整體 Release FAIL**，因 Shared Codex `older_revision_has_live_tag` 使 retention 安全阻擋。勿自行解除不明 live tags；先完整列出 tag／revision／traffic／rollback，再做受控清理。RUA 管理員 OAuth allowlist、唯讀 Gateway DB、跨專案真實統計、UI 登入讀回仍未通過。
- [x] **Release Artifact 附件範圍安全修正**：發現舊 `*.json` 包含 runner 暫存 WIF credential configuration；已改為僅封存 `readiness.json` 與 `release.json`，並由 [Actions #38991688176](https://github.com/tommylin15/omniAgent/actions/runs/38991688176) 精確核對身分刪除受影響的 Artifact，讀回不存在。**勿將受影響的舊附件重新分享。**
- [x] **正式流量唯讀獨立讀回**：[Actions #38991930476](https://github.com/tommylin15/omniAgent/actions/runs/38991930476)：Chat `00124-hup`、Gateway `00101-fec`、Shared Codex `00078-vap` 均 Ready 且各占 100% 正式流量；Revision 數量分別 44／32／31。RUA 四項設定旗標及安全連線 **全部尚未配置**（enabled、admin Owner list、reader DSN、verified CA），故 **戰情室正式資料讀回 NOT_RUN，不能宣稱 LIVE DONE**。舊候選／測試 tag 大量存在，retention 不得誤清 preview／正式 rollback。

### RUA-02 staged runtime results (2026-10-17)
- [x] **RUA-02A Chat admin-only route (runtime PASS; human OAuth E2E OPEN)**: [preflight #39021269576](https://github.com/tommylin15/omniAgent/actions/runs/39021269576) verified owner mapping and missing Gateway ledger; [rollout #39021649125](https://github.com/tommylin15/omniAgent/actions/runs/39021649125) verified exact Chat image, zero-traffic candidate anonymous 401, unchanged Chat Dispatch OFF, then 100% live revision omniagent-chat-00128-ver. Authenticated admin 200 and Flutter mobile use require owner readback.
- [ ] **RUA-02B persisted Gemini Gateway analytics**: no active GEMINI_SHARED_LEDGER_DATABASE_URL or verified CA, no dedicated omniAgent gateway database in the inventory. Provider-count and owner totals from the Gateway are NOT_CONFIGURED, not zero. Do NOT simply toggle GEMINI_SHARED_QUOTA_ENABLED: it requires Owner HMAC authorization and would break existing consumer contracts. Implement separate bounded metadata telemetry with SELECT-only reader and verified TLS; verify actual non-sensitive multi-project rows and coverage before DONE.

- [ ] **RUA-02B passive telemetry candidate**: Gateway isolated metadata writer + migration 008 + optional Chat passive reader + tests have been staged in source. **GATED OFF by default**; do not mark production DONE until dedicated PostgreSQL DB, least-privilege writer/reader roles, verified CA, secret IAM, zero-traffic signed tests, 100% live readback and explicit coverage limitations are validated. Writer errors must not interrupt Life/Janus inference.

### 2026-10-17 RUA-02B existing bundle correction

- [x] **Credential design corrected:** use only existing Secret Manager `omniagent-bundle` (not `omniagent-usage-writer-db`, `omniagent-usage-reader-db` or `omniagent-usage-ca-pem` resources). Retired failed three-Secret workflow; reader/Writer still use distinct PostgreSQL roles, configured under the new JSON `router_usage` section. See [analytics contract](../docs/ai-router-analytics.md).
- [x] **Code/limited CI:** runtime readers for Gateway/Chat use their role-selected connection from existing bundle; protected merge helper preserves provider and signing-key fields and validates existing VM DB endpoint/TLS certificate. CI [#39027983431](https://github.com/tommylin15/omniAgent/actions/runs/39027983431) passed; independent Acceptance [#39028560014](https://github.com/tommylin15/omniAgent/actions/runs/39028560014) PASS.
- [x] **Existing bundle credential merge and readback PASS (2026-10-17):** operator granted Secret-scoped Version Adder; one-shot [#39029235010](https://github.com/tommylin15/omniAgent/actions/runs/39029235010) reports `rua02b_existing_bundle_merge=PASS`, `rua02b_bundle_version_readback=PASS`, `rua02b_new_secret_resources=ZERO`. New version is added to existing `omniagent-bundle`; previous keys preserved. Workflow returned to manual-only. This proves Secret version readback, **not** DB login, capture, live inference coverage or dashboard E2E.
- [ ] **Remaining live:** after bundle append/readback, enable NOLOGIN DB roles with scoped credentials and narrowly scoped HBA if needed; test verified TLS and bounded INSERT/SELECT, opt-in capture, admin 401/403/200, multi-project non-sensitive actual events, CI/candidate/formal readback. Existing traffic stays unchanged and RUA-02 remains **PARTIAL**.
- **Security caveat:** one bundle exposes both SQL credentials to both bundle readers; SQL permissions are distinct but Secret payloads are not service-isolated. Record this deviation from strict independent-Secret least privilege; do not claim that the two runtimes cannot access one another's credentials.

- [x] **Post-bundle independent runtime inventory**: [DB readiness #39029493380](https://github.com/tommylin15/omniAgent/actions/runs/39029493380) confirms `gateway_db_exists=1`, `usage_roles=omniagent_usage_reader:false,omniagent_usage_writer:false`, `chat_hostssl_scope=1`, `usage_hba_scope=0`, `hba_parse_errors=0`. DB role LOGIN and dedicated HBA are still OPEN and must not be assumed working because the Secret merge succeeded.
- [ ] **RUA-02B next controlled gate**: transactionally set only `omniagent_usage_writer`/`omniagent_usage_reader` login credentials matching the existing bundle; add tightly scoped `hostssl` rules, perform `verify-full` real login plus writable/read-only negative SQL tests and confirm no impact to the shared host. This gate has **NOT_RUN**; no Cloud Run traffic promotion or passive capture enablement.

### 2026-10-17 RUA-02B current runtime receipt (post bundle merge)
- [x] [Read-only GCP inventory #39030984141](https://github.com/tommylin15/omniAgent/actions/runs/39030984141) **PASS**: `gateway_db_exists=1`, both telemetry roles still `NOLOGIN`, `usage_hba_scope=0`, `hba_parse_errors=0`, Postgres SSL on; Gateway `GEMINI_SHARED_USAGE_ENABLED` absent, Chat `ROUTER_USAGE_ENABLED=true` but dedicated reader URL absent. No passive production capture proven.
- [x] **Gateway latency guard code+tests**: [commit `62543ee`](https://github.com/tommylin15/omniAgent/commit/62543eea8732db5060701b51aedc162d7520b231) caps best-effort analytics wait at 125ms, marks slow writes `deferred`; [CI #39030779256](https://github.com/tommylin15/omniAgent/actions/runs/39030779256) Node/Flutter/Acceptance PASS. This does not make capture complete.
- [x] **RUA-02B DB/TLS activation completed after this historical checkpoint**: two role LOGIN states confirmed from [runtime #39030984141, retry 3](https://github.com/tommylin15/omniAgent/actions/runs/39030984141); dedicated same-CIDR hostssl with rollback backup [#39036233760](https://github.com/tommylin15/omniAgent/actions/runs/39036233760); SSL verify-full, wrong host/password, Writer INSERT+ROLLBACK, denied Writer SELECT and Reader INSERT [#39036407741](https://github.com/tommylin15/omniAgent/actions/runs/39036407741). These prove DB boundary only, NOT actual Gateway model usage.

### 2026-10-17 RUA-02B LATEST | database PASS, Gateway candidate PASS, live NOT DONE
- [x] Existing `omniagent-bundle` credential update/readback: [#39029235010](https://github.com/tommylin15/omniAgent/actions/runs/39029235010) PASS; no new Secret resources.
- [x] Both telemetry PostgreSQL accounts LOGIN true: independent [#39030984141, retry 3](https://github.com/tommylin15/omniAgent/actions/runs/39030984141) PASS.
- [x] Dedicated PostgreSQL `hostssl` rules for `omniagent_gateway` and two roles, with original backup and unchanged Chat rule: [#39036233760](https://github.com/tommylin15/omniAgent/actions/runs/39036233760) PASS.
- [x] TLS `verify-full`, wrong-host/wrong-password rejection, Writer INSERT+ROLLBACK, Reader SELECT, inverse SQL permission denial: [#39036407741](https://github.com/tommylin15/omniAgent/actions/runs/39036407741) PASS; no telemetry rows retained by these tests.
- [x] Gateway original lacked VPC; identified same-network subnet `janusai-lake-poc-uscentral1` via [#39036766727](https://github.com/tommylin15/omniAgent/actions/runs/39036766727). Built **Gateway-only** immutable GHCR image and 0%-traffic candidate revision `omniagent-agent-gateway-00107-doy` with `GEMINI_SHARED_USAGE_ENABLED=true` and direct VPC private-range egress; [#39036960225](https://github.com/tommylin15/omniAgent/actions/runs/39036960225) PASS; original serving revision retains 100% traffic and live telemetry is still disabled.
- [ ] **NEXT BLOCKER: REAL SIGNED MODEL CANARY + DB READBACK**. No Life/Janus signed invocation to the tagged 0%-traffic candidate has passed, and no real Gateway usage event was read back. Do NOT promote to 100% or claim counts until caller authentication, provider response, exactly-one event, all applicable source/project coverage and post-deploy runtime checks pass. Candidate readiness alone cannot demonstrate private database reachability or real usage capture.
- [ ] After successful signed canary: promote with reversible rollback gate, verify formal traffic, Life and Janus flow and owner-filtered Chat admin 401/403/200, and reconcile coverage for slow/deferred telemetry. Treat RUA-02B **PARTIAL** and do not confuse 0%-candidate flag with live enabled.
