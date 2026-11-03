# Unified provider execution receipts

2026-11-03：本輪只完成 source、migration 與測試程式；未執行測試、build、DB migration、CI、部署或 provider runtime 驗收。

`PROVIDER_LEDGER_ENABLED` 預設 OFF。開啟後使用既有 `createQuotaPool` 驗證 TLS 及 `GEMINI_SHARED_LEDGER_*` 連線，但 database 必須是 omniAgent 自有 `omniagent_gateway`。需先套用 Gateway migrations 008、012、021，再分別審核 writer table 與 reader view 的 least-privilege 權限。Ledger 不儲存 prompt、輸出文字、credential、OAuth token 或 provider 原生 Secret handle。

`provider_execution_receipts` 的非 Shared 來源以 partial unique index 保持 `(project,provider,request_id)` 唯一；Shared Gemini 依 server-generated `execution_id` 主鍵去重，consumer `request_id` 僅供關聯，同一 consumer ID 的不同獨立執行仍可分別記錄。重複同一 execution ID、或 Chat／Agent 同一 request ID，均拒絕重放。先 reserve 再執行 provider operation；一個執行內不自動重試。Inference fetch 送出前必須 durable 記錄 dispatch-started，只有真 provider HTTP response 才填 provider-responded／HTTP status。Discovery、Key/config refusal、countTokens 不計作 inference。

狀態判讀：

- `reserved`：尚無 durable dispatch marker；不能宣稱發生推論。
- `preflight_rejected`：拒絕於 inference 之前；不能當成實際 provider 呼叫。
- `unknown`＋dispatch-started：可能已送出，不能推定 provider 收到或成本為零。
- `unknown`＋provider-responded：HTTP 回應已確認，但 body、stream、usage 或結算不完整。
- `failed`：實際 provider 的非 2xx HTTP 回應（包括 429），不自動重試。
- `completed`：provider client operation 已完成；不等於 Chat 業務完成或安全／品質驗收通過。

新共同收據涵蓋 Assistant Gemini／OpenRouter／Groq 與 Paid Gemini 的 Agent／Chat generateContent。HTTP 2xx confirmation、application acceptance、token usage 與成本各自獨立；缺少 usage 時 input/output/total 都是 NULL，不以 prompt bytes、保留上限或 Chat turn 數代替。`actual_model` 是 client 最終使用的模型 ID（例如 OpenRouter alias 解析後 target），不宣稱未知的 provider 內部版本。

費用只有 Paid Gemini 的已結算 `paid_model_execution` 才可填入，透過同一 project/owner/request/model、provider tokens、費率版本及 actual micro-USD 再次比對。共同收據不重做 quota reservation，也不把 paid budget 表 union 成第二個執行。其餘 provider 的實際費用為 UNKNOWN，不因標示 free model 就捏造零美元。

Shared Gemini 保留既有 passive telemetry contract；新收據與舊 event 使用同一 server-generated execution ID。View `omni_gateway.unified_provider_execution_usage` 只 anti-join 相同 execution ID，保留過往真正重複執行的不同 event，不以同一 consumer request ID 錯刪多筆歷史呼叫。舊 passive row 沒有的 HTTP timestamp/status、token split 及 cost 一律 NULL，不捏造 HTTP 200。

報表應區分預檢、dispatch uncertainty、provider-confirmed responses、HTTP 2xx/non-2xx、completed/unknown 和 usage/cost known/unknown。不得使用 Chat turns 加總來宣稱真模型執行數。Owner/Admin visibility 仍須由 RouterUsageStats 的服務端 guard 保護。

**明確限制：** Codex native RPC 的 turn-start acknowledgment 不能證明實際 inference 或最終 tokens。此輪保留既有 native receipts，沒有用 synthetic HTTP status 或 Chat turn 將其偽裝成共同 provider execution；native 的 provider tokens／成本／統一計數仍須對接可核實的原生 execution evidence。Module 的 provider 類型預留 codex 不代表已完成此對接。

Server shutdown 會關閉共同 ledger pool。開關 OFF 時不建立新 pool，也不改變既有 consumer envelope；ON 時 reserve／settlement 失敗採 fail-closed，模型可能已執行的不確定請求需靠收據核對，不能重送。
