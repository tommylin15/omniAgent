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

