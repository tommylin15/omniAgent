# omniAgent Risk Audit — 2026-10-14

Overall full product status: PARTIAL. This audit is static and does not claim a fresh production penetration test.

See [current TODO](../doc/todo.md) and [acceptance](../doc/acceptance.md).

## P0 / 高優先風險

| ID | 風險與程式／runtime 證據 | 判定 | 退出條件 |
| --- | --- | --- | --- |
| R01 | Gateway Gemini 正式 ON，但 Chat 正式 `CHAT_DISPATCH_ENABLED=false`；不能將 Gateway PASS 當作 Chat 全功能發布。見 [GCP 讀回](https://github.com/tommylin15/omniAgent/actions/runs/38498845455/attempts/3)。 | **CONFIRMED** | 授權 Owner、entitlement、成本、正式 signed 回覆與 PostgreSQL terminal E2E |
| R02 | `services/agent-gateway/shared_gemini.ts` 與 `services/shared-codex/server.ts` 驗 project→SA，請求內 ownerId 由合法 consumer 傳入。最終使用者 Owner 授權由 consumer 負責，不是 Gateway 自動驗證。尚未證明發生跨 Owner 洩漏。 | **CONFIRMED 信任邊界，需驗證後果** | 各 consumer 的 Owner authorization assertion、負面測試、跨租戶隔離與原生 DB 驗收 |
| R03 | `services/chat-api/database.ts` 在 private-self-signed 模式使用 `rejectUnauthorized:false`；TLS 有加密但缺伺服器證書驗證。 | **CONFIRMED code；實際啟用模式待查** | 受信 CA／hostname 驗證、stage 連線及受控切換 |
| R04 | Gemini Gateway `MAX_RUNNING=2` 和 Shared Codex `busy` 是單執行個體記憶體狀態，不等於 Cloud Run 跨 instance 的全域成本／併發限額。 | **CONFIRMED code；影響依部署拓撲** | per-project／Owner quota、billing alerts、跨實例 idempotency |
| R05 | Owner Chat 只有單 Owner Preview 回覆與 DB 持久化的限定 PASS；真實第二 Owner、Codex context、SSE/approval/cancel/failure recovery 尚缺完整正式 runtime E2E。 | **MISSING_EVIDENCE** | 具合法身分的正負例、terminal + replay + reconnect、受控恢復收據 |


## P1 / 中高優先風險

| ID | 風險與程式／runtime 證據 | 判定 | 退出條件 |
| --- | --- | --- | --- |
| R06 | `services/agent-gateway/server.ts` ManagedAuthStore 的 `mutation` lock 是 process-static，`destroyVersions` 會清理較舊 Secret versions；不同 Cloud Run instances 若同時旋轉可能存在競態。 | **CONDITIONAL** | 檢驗實際多實例、CAS／版本控制與並發回復測試 |
| R07 | 多個歷史 release／retention workflow 仍有 once-marker 或手動 apply 入口；今日清理成功不代表這些破壞性入口不可能再被操作。 | **CONFIRMED code** | 封存／停用舊入口、保留新流程的 Owner 授權、最新 GCP preflight 和 fallback |
| R08 | `apps/agent_app/lib/chat_api.dart` 以微秒時間戳為每次 POST 的 idempotency key；同一操作若重新送出會換 key；API client 亦未明確設置每次呼叫 timeout。 | **CONFIRMED code；實際重複發送待測** | per-operation 穩定 UUID、timeout／取消 UX 和重送整合測試 |
| R09 | Actions overall `success` 可能代表 guard/no-op，非真正發布。[#38568825058](https://github.com/tommylin15/omniAgent/actions/runs/38568825058) 的 promotion steps 為 `skipped`。 | **CONFIRMED** | step-level gate、source SHA／digest／正式 traffic readback |
| R10 | 舊的建立 Chat 對話錯誤因 Logging 權限不足未獨立確認原始根因，之後成功不能反推當時是哪項缺陷。 | **MISSING_EVIDENCE** | 精確的 requestId 對應脫敏審計、最小唯讀 logging 權限 |


## Additional coverage

- **R11 / P1:** Groq provider adapter source exists, but production Chat integration is unaccepted; BYOK management is off by default.
- **R12 / P1:** Historic documentation conflicted with the current formal Gateway and ten-revision acceptance. Current TODO and acceptance now supersede it.
- **R13 / P2:** Legacy Cloud Build YAML and workflows remain in the repository. Actual trigger and old asset dependencies require fresh GCP readback before deletion.
- **R14 / P2:** GCS artifact tier, Iceberg archival and BigLake analytics are architectural targets, not independently accepted deployed services.

This is a static evidence review, not a live security incident or penetration-test claim. Closure requires code, tests, CI, deployment and runtime proof.
