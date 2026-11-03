# 2026-11-03 原始碼交付檢查點

狀態：**SOURCE WRITTEN／NOT VERIFIED**。這是 P0／P1／P2 本輪程式與測試程式的交付紀錄，不是產品 DONE、測試通過、正式部署或整合驗收收據。

依使用者順序，本輪先撰寫程式、整合呼叫端及測試程式，執行 source-only `/ponytail-review`，再回寫 GitHub；整體測試與驗收留在後續階段。最新指示要求完成程式後回寫文件並停下，因此此檢查點不執行 build、測試、migration、模型呼叫或部署。

## 本輪原始碼

| 範圍 | 已寫入的程式 | 驗證狀態 |
| --- | --- | --- |
| Agent | 獨立 private Worker、模型 Function Calling、後端工具 Registry、Owner/run/turn FK、checkpoint、lease/fence、時間／步數／工具／Token／費用限制、停止與受控續跑、Chat SSE 事件 | NOT_RUN |
| L2 寫入 | 精確 tool/input/digest/actionId 核准、Worker 與 Gateway 分離的單次寫入領取、固定 readback binding、未知結果阻擋重放；一般 Agent 不接受 L3 | NOT_RUN |
| 模型與用量 | Paid Gemini 獨立 Key、實際 models/countTokens/generateContent 路徑、版本化費率及 PostgreSQL 預留、Chat Paid-Lite／Flash 權限、Groq Chat／Gateway／Flutter 接線、共同 HTTP provider 收據及去重 view | NOT_RUN |
| 憑證 | Owner/provider/profile/running-turn resolver、版本釘選與 CRC32C、Gemini／OpenRouter／Groq BYOK、分散式 CAS 輪替、讀回後切換、舊版本清理及未知結果 reconciliation | NOT_RUN |
| Admin／Flutter | 管理設定與 Owner/model/tool 安全草稿、CAS／audit、Secret 是否配置狀態、Agent／工作／通知／排程／憑證 Product Hub、產物存取頁 | NOT_RUN |
| 恢復 | DB durable message intents、跨裝置讀回、同 transaction 消耗意圖、取消 tombstone 與遲到 POST 拒絕、原始 key 保留；舊同分頁路徑保留 | NOT_RUN |
| P2 資料 | Owner-bound GCS 產物、generation/SHA256 讀回、實際 PyIceberg writer 與 snapshot reconciliation、受限 BigQuery／BigLake 查詢、背景工作／lease／排程／通知、五項唯讀／shadow 工作流 | NOT_RUN |
| 成本與交付 | 產物 bytes/object、Owner/global queue/schedule、UTC 每日 analytics 額度；Worker Dockerfiles、手動 immutable image publish、0% private deploy 與 additive migration runner | NOT_RUN |

對應程式位置：`services/agent-gateway/`、`services/agent-worker/`、`services/chat-api/`、`services/job-worker/`、`services/archive-writer/`、`apps/agent_app/`、`infra/postgres/migrations/010..021`。Node／Flutter／Python 測試程式已加入；未執行，不能把作者或代理報告視為 PASS。

## 已處理的 source review 問題

- 新 Worker 原先只有 Dockerfile，沒有映像發布入口：已加入手動 exact-main-SHA 的三映像 publishing workflow；此流程不部署或切流。
- 文字產物原先不能交給 JSON-only writer：writer 改為保留原 UTF-8 bytes 的 text/JSON envelope 並驗證原 SHA256。
- 跨裝置取消原先可能留下舊 client pending key：加入精確 key 的 tombstone 讀回，只清除已核實取消的原 key。
- 產物、排程、queue 與 analytics 增加明確設定的持久額度；設定缺少時拒絕啟用，不使用虛構預算。
- Shared Gemini 既有同一 consumer request ID 的不同實際 execution 保留；統一 view 按 execution ID 去重，不改算 Chat turn 數。

## 明確限制與外部前提

1. 所有新執行旗標仍需明確配置；本輪沒有修改正式服務開關或流量。Admin 保存的是 draft，不直接改 live entitlement、Secret、IAM 或 Billing。
2. Key 所屬 project、Paid Tier／prepay、實際費率、Owner OAuth、MCP scopes／schema／readback 欄位、Cloud Run identities、DB roles、CA、GCS bucket、Iceberg catalog/table 與 BigQuery/BigLake 資源尚未做 runtime 核對。缺少時保持不可用。
3. Codex native turn-start 回覆不等於一次模型推論。既有 native receipt 保留；原生每次 inference ID／Token／計費證據尚缺，統一 provider 計數不包含捏造的 Codex 次數。其餘 provider 未有核實價格／帳務時費用為 UNKNOWN。
4. 不設定或執行自動熱資料刪除、GCS purge、Secret retirement、跨專案 DB 存取或外部正式發布。保存期限及儲存門檻仍需真實成長量測與明確政策。
5. 未核對最新遠端 CI／GCP runtime，也未處理需要 runtime tag/rollback 盤點的 Shared Codex retention 阻塞。歷史 PASS 僅維持原先證據範圍。

## 後續驗證順序

1. 回寫後先跑 TypeScript build、Node/Python/Flutter 測試及本地隔離 PostgreSQL；依結果修正、review 並回寫。
2. 在相同來源 SHA 完成 CI、三既有映像與新 Worker 的 immutable image receipts；套用 migration 前核對 own DB、角色、權限、CA 與備份／回復方案。
3. 執行 0%-traffic private candidate、Owner 正負例、L2 重送／故障注入、provider／Token／費率與 DB 收據、跨裝置及手機 UI 驗收。
4. 所有正式 gate 滿足後，才進正式發布與獨立 runtime readback。不得把 source checkpoint 或單一 workflow 步驟改寫成全產品完成。

操作契約：[`paid-gemini-runtime-wi.md`](paid-gemini-runtime-wi.md)、[`product-data-runtime.md`](product-data-runtime.md)、[`message-intents-wi.md`](message-intents-wi.md)、[`provider-receipts-wi.md`](provider-receipts-wi.md)。
