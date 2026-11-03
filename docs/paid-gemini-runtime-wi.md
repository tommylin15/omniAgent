# Paid Gemini／Agent Gateway source integration

2026-11-03：此頁記錄本輪新增 source 契約；測試、compiler/build、CI、migration、部署、真 provider、Billing 和雙 Owner 驗收均**尚未執行**。不構成正式啟用或 DONE 證據。

## 付費呼叫

Gateway 的 `PaidGeminiProvider` 只讀取 `OMNIAGENT_PROVIDER_BUNDLE` 內的 `gemini_paid_api_key`，不讀取 Lite Key，也不在失敗時回退。以下值缺少即拒絕：

- `GEMINI_PAID_ROUTING_ENABLED=true`、`GEMINI_PAID_TIER_VERIFIED=true`。
- `GEMINI_PAID_BILLING_EVIDENCE_REF`：需填真正的 Key 所屬 project、Billing／Paid Tier／prepay 核對收據，不是此文件或測試 fixture。
- `GEMINI_PAID_MODELS_JSON`：模型 ID 陣列；設定不等於模型可用。
- `GEMINI_PAID_PRICES_JSON`：每列 `{model,version,source,validUntil,inputMicrousdPerMillion,outputMicrousdPerMillion}`。`source` 須是官方 `https://ai.google.dev/` 費率來源；費率必須為核實且適用該模型／請求層級的正整數 micro-USD／百萬 tokens。沒有內建價格；缺值或過期是 UNKNOWN。
- `GEMINI_PAID_BUDGET_CAPS_JSON`：`ownerDay`、`ownerMonth`、`projectDay`、`projectMonth` 各為 `{calls,tokens,microusd}` 正整數硬上限。

每次呼叫先用同一 paid Key 讀取 `models.get` 驗證方法和限制，再以完整 `generateContentRequest`（含 system 和工具 schema）呼叫 `countTokens`，預留輸入＋輸出上限，才呼叫 `generateContent`。Provider usage 的 total 包括 thinking；費用採輸入 tokens 與其餘輸出 tokens 的已預留費率版本。資料只支援文字和 function declarations；grounding、multimodal、cached/tool-use usage 無適用計價時拒絕。

`012_paid_model_budget.sql` 應套用到 omniAgent 專用 Gateway ledger DB；連線沿用 `GEMINI_SHARED_LEDGER_DATABASE_URL`／`GEMINI_SHARED_LEDGER_CA_PEM`／`GEMINI_SHARED_LEDGER_TLS_SERVERNAME` 的驗證 TLS helper。需另核對 least-privilege DB table 權限，不得把未執行 migration 寫成完成。

預留與四項預算檢查在同一交易與 advisory lock 內完成，`(project,request_id)` 永久去重。失敗、429、斷線、不明 usage／結算皆不自動重送，也不自動釋放預留額；須取得真帳務／使用量收據後另行核對。不明執行不是零費用。這不是 GCP credit 的硬上限。

## Chat 與 Flutter

Signed assistant body 的 `routeProfile` 為 `private-lite`／`advanced-flash` 才走 paid 分支；Gateway 另以 `GEMINI_PAID_OWNER_MODELS_JSON` 的 `{ownerUUID:[modelIds]}` 核對精確 Owner／模型。Chat 有獨立 entitlement、flag 和 thread profile；兩端均須核對。未帶 paid profile 維持既有公開 Lite 路徑，不以模型名稱推定付費授權。

Flutter 用本機 `gemini-paid` 選單區隔相同 Lite ID 的公開／付費 entitlement，送 API 時仍為 `runtime:gemini`＋後端回傳的 profile；paid catalog 為空，只顯示 `/v1/models` 真授權。這個清單仍不證明 provider availability。Groq 同樣必須先取得後端模型授權。

## Agent 決策與工具

`/internal/v1/agent/decision` 與 `/tool` 預設關閉；需 `AGENT_GATEWAY_ENABLED=true`。Cloud Run IAM、有效 Google ID token 及 HMAC 三者均不可省略。`AGENT_GATEWAY_AUDIENCE` 為精確 HTTPS audience；`AGENT_GATEWAY_CALLER_EMAILS` 只列可呼叫的 verified service-account email；HMAC 沿用 `MCP_OWNER_SIGNING_KEY`，Worker signing key 需對應。

`AGENT_GATEWAY_OWNER_POLICY_JSON` 是 Owner UUID → `{model,tools:[{name,serverId,configRef,risk}]}`。模型是後端政策，不取自 LLM。工具只能 L0／L1／L2，拒絕 L3；name 必須是該 server 的 namespaced MCP 名稱。呼叫端送來的 schema／description 必須與 Gateway 獨立發現、授權後的版本相同。

L2 binding 另外必須有 `readbackToolName`、`actionIdArgument`。Gateway 會從 LLM schema 隱藏該 string 欄位，再把已核准穩定 action ID 注入寫入和讀回呼叫。兩個 MCP schema 都必須支援這個欄位；工具契約本身需提供穩定冪等與可核對讀回，不能自行捏造跨系統能力。

Worker tool body 是 `{ownerId,runId,requestId,toolName,arguments,actionId,operation}`，operation 為 write／readback。Gateway 在驗證完整 MCP schema 後，用 Google service identity 呼叫 `AGENT_ACTION_CHAT_URL` 的 `/internal/v1/chat/agent-actions:authorize`；`AGENT_ACTION_CHAT_AUDIENCE` 必須等於該 HTTPS origin。Chat 必須驗證 durable approved/executing receipt 及精確 Owner/run/action/tool/arguments digest，write claim 一次性消耗；不明寫入只允許受控讀回，不可盲目重送。Gateway 的後端 binding 決定 readback 名稱，呼叫端不能替換。

## BYOK 與 Admin 草稿

BYOK Gemini／OpenRouter／Groq 維持既有模型政策，且不能當作 paid private route 的保證。`BYOK_EXECUTION_ENABLED`、`BYOK_SECRET_PROJECT`、`BYOK_CHAT_URL`／`BYOK_CHAT_AUDIENCE` 均須明確設定。每次執行重新向 Chat 查詢精確 Owner/provider/profile/running-turn 綁定，僅存取 configured project 下 `omniagent-byok-<32 hex>/versions/1`，驗證 resource 與 CRC32C；輪替可使用新的資源 ID，但不使用 latest、不快取 Key、不交換 process env。錯誤不包含 Key 或 Secret payload。

Admin access 的 `019_agent_admin_access.sql`、`AgentAdminAccessStore` 與 Flutter `AgentAccessPage` 只保存草稿與原子 audit；`/v1/admin/agent-access` 還須由服務端 OAuth Admin guard 保護。每筆最多 100 Owners、各 32 模型及 128 工具，CAS 衝突保留編輯內容。保存草稿不更新 live entitlement、MCP grant、Secret 或 deployment flag。

## 後續驗收

依使用者順序，先完成全部 source，再 `/ponytail-review`、統一回寫；之後才跑測試／exact SHA CI／0% candidate／真 provider、DB、Billing、OAuth、L2 負例與 UI 驗收。本輪新增測試程式不是已執行的證據。正式資源、Key project、費率、Tier、跨系統 schema、Owner OAuth 或驗收缺值必須明列 UNKNOWN。

官方 API 契約來源：[models.get](https://ai.google.dev/api/models)、[countTokens](https://ai.google.dev/api/tokens)、[generateContent／function declarations／usageMetadata](https://ai.google.dev/api/generate-content)。模型與費率來源必須在驗收時再次核對。
