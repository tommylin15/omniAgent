# Phase 6B dev 驗收 checkpoint（2026-09-23）

狀態：**partial；不得標為 real dev cutover / full acceptance 通過。** 本 checkpoint 僅完成獨立 Gateway 候選部署、真實 OpenRouter／Gemini dispatch、Chat/UI image build，以及 Janus MCP OAuth 路徑的獨立守衛檢查。Janus 仍是唯一 live Chat writer；沒有切 Chat 流量、寫入權或 production。

## 可重現識別與實際證據

| 項目 | 結果 |
| --- | --- |
| Janus 基線 | `6f52ed3238ddfcb77d3d48659c59fa5bcfedbd39`；`janus-api-00154-74s` 仍佔 100% 流量，image `sha256:3be7c05489ab6329632a94372f8c311f7de5a0f4ab485ec012d8340eb2c13d9c`；`janus-agent-gateway-00044-jtn` 仍佔其服務 100% 流量。 |
| omniAgent source | `3acab14`：Chat/UI 同源容器及 Gateway build 修正；`1d9b8441e33fbefc94ccb878bfdd8526f8ae12da`：驗收腳本與 source ignore 修正。此文件的 commit SHA 以本次 evidence checkpoint commit 為準。 |
| Gateway build / image | Cloud Build `30af8a13-fb5b-437f-8037-0a36279847c5` **SUCCESS**；`omniagent-agent-gateway@sha256:8278561a8ba5eaeaa3e209a151699391044530646d1498396724b00516afc773`。 |
| Gateway deploy | 新的私有 Cloud Run `omniagent-agent-gateway-00001-wav`，候選 tag `phase6b-candidate`；只佔自己新服務的 100%，不是 Janus 或 Chat 入口流量。runtime SA：`omniagent-gateway@gen-lang-client-0593591102.iam.gserviceaccount.com`。 |
| 真實 provider runtime | 首次驗收 build `860e7d72-3f23-4cfd-9088-cf4a24be088f` 因驗收 shell 少 `done` 失敗，**不算 runtime failure 或 pass**。修正後 GCP worker build `aba675c4-71f9-47e5-a547-33c7f2ddac52` **SUCCESS**：以 `omniagent-chat` SA 的 Google ID token 與 HMAC 呼叫私有 Cloud Run；OpenRouter `openrouter/free` 回傳 3 個事件、Gemini `gemini-2.5-flash` 回傳 2 個事件，均有非空文字及 `turn_completed`。未把回應正文或密鑰寫入 log。 |
| Chat/UI build | Cloud Build `f28d1f52-fc88-42e7-9269-590ae379b9e5` **SUCCESS**；`omniagent-chat@sha256:ceda5c1cac842758018433f7e2de1b74c46cd23b76bd4159f3c170b8f70747b5`。**未部署**，故不算 OAuth UI 或 E2E 通過。 |
| Janus MCP 獨立路徑 | 既有 Janus tagged OAuth／adapter routing 保留。無 source upload 的 GCP worker build `8c1f8fff-83fc-4c65-a6d4-7da7cca6a37a` **SUCCESS**：protected-resource metadata 200、authorization-server metadata 200、token／authorize 負向守衛各 400。歷史 2026-09-17 曾由 dev VM 驗證 OAuth callback 與三個 read-only tool 200；**本次未完成 ChatGPT app UI tool discovery／三次 invocation**，不得以 metadata 檢查宣稱該項完成。 |
| 本機直接驗證 | `npm.cmd run build` PASS、`npm.cmd test -- tests/chat_api.test.ts` 5 PASS、`flutter.bat analyze lib test` PASS；基線完整 `npm.cmd test` 26 PASS、1 個需環境的 storage acceptance SKIP。這些不代替 GCP live 驗收。 |

## 資源與邊界

- 沿用既有 project、Cloud Build worker、Artifact Registry `janusai-poc`；沒有新 registry、trigger、VM、disk、snapshot、HA、scanning 或 production 資源。Cloud Build、Cloud Run、image 儲存、Secret 版本仍可能計費，**不可宣稱零費用**。
- 新建 `omniagent-provider-bundle` v1（僅 Gemini／OpenRouter 所需欄位）與 `omniagent-internal-signing-key` v1；未把 Janus provider bundle 整包授予 omniAgent。新建 `omniagent-gateway`／`omniagent-chat` runtime SA，Gateway 僅可讀兩個新 Secret，Chat 可 invoke 新 Gateway。驗收暫授 Cloud Build worker 的 Chat SA Token Creator 與 signing Secret Accessor 已撤銷並查驗。
- 新 Google OAuth Web client `omniAgent Dev Web` 已建立；因 Chat/UI 未部署，尚未登記實際 origin，亦未進行 Google 登入驗收。未複用 Janus OAuth client。
- Gateway 不匯入 Janus 程式或讀 Janus PostgreSQL／GCS／Iceberg；Janus 對 omniAgent 沒有反向 runtime dependency。舊 `janus-agent-gateway`、Janus deployment scripts、`janus-agent-provider-bundle`、`janus-codex-owners-bundle` 保留。後者目前無 enabled version，不能冒稱 Codex managed auth 已可用。
- 既有 dev PostgreSQL VM 查得 `e2-micro`、30 GB 磁碟且未擴容；尚未建立 `omni_chat` logical DB／role，未套 migration、搬歷史資料、dual write 或切 Chat write ownership。

## 尚未通過的 Phase 6B 驗收

1. Chat API／Flutter UI 實機部署、Google OAuth origin／登入、獨立 Chat DB／migration、訊息從 Chat API 交付 Gateway 的 runtime dispatch、真實端到端聊天：**未完成**。目前 Chat API 只會持久化排隊訊息，沒有 live dispatch worker；部署 image 不能替代功能驗收。
2. MCP discovery／call、omniAgent → Janus bounded real API/MCP 與 owner mapping／isolation：**未完成**。不能把 Janus MCP fixture 或某個 owner 的全域 token 當作多 owner real acceptance。
3. UI 層 streaming／reconnect、approval、cancel、Codex managed auth：**未完成**。本次 OpenRouter event array 證明 provider 產生事件，不證明瀏覽器 SSE 重連或 approval 流程；Codex owner auth 尚無有效 Secret version。
4. ChatGPT → Janus MCP 的 ChatGPT app tool discovery／實際 UI invocation：**未完成**；本次只確認既有 MCP OAuth metadata／守衛路徑仍正常。
5. 歷史 owner export／copy／verify、reverse-sync rollback：**未完成**。依已核准 plan，Phase 6B 第一階段不切 Chat writer；在 reverse-sync 另行驗證前 Janus legacy Chat writer 繼續保留。

回退界線：新 Gateway 是獨立私有候選服務，Janus 入口與資料未更動，因此目前回退只需停止／停用此候選及不使用新 image；不得把舊 `usefulness-rollback` tag 視為可用 image（其 image 已缺失）。**沒有做寫入權切換，故沒有聲稱完成 post-cutover rollback。**
