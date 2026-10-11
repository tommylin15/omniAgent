# omniAgent OAuth 自動驗收政策｜2026-10-12 Owner 決策

**人工 Google OAuth 登入驗收正式取消（NOT_REQUIRED / REMOVED）。** 從本日起，不再要求 Owner 真人 Google 登入、A→B→A 帳號切換、固定 Preview 登入、提供截圖或 URL 才能發布。不能把沒有執行的人工驗收記成 PASS；這條規則優先於舊文件中的人工 OAuth gate。歷史驗收紀錄保留。

**其它能自動執行的 OAuth／身份驗證全部保留：** Google JWT issuer、audience、subject、到期時間與無效 token 拒絕；OAuth Client ID／來源設定讀回；匿名 API 401、私有 Cloud Run IAM 403、授權服務帳號簽章、Gateway HMAC 正反例；server-side Owner issuer/subject 綁定與跨 Owner thread／turn／event／SSE／credential／session 隔離負向測試。使用 CI fixture、受控測試身份、合法 API／DB runtime 讀回，記錄可重跑證據。不得洩漏 token、refresh token、Cookie 或 Secret。

**不能冒充真人 OAuth 證據。** Service Account ID token 不是 Google 使用者 OAuth token。若環境沒有合法的真實 Google 使用者 token 供自動化使用，將該特定 E2E 項目記為 NOT_VERIFIED_AUTOMATION_UNAVAILABLE，不要求人工補驗，也不造假 PASS。

**發布分層判斷。** Chat dispatch／BYOK 仍關閉的程式碼／基礎正式部署，不因缺人工 OAuth 而阻塞，但仍須 CI、自動 auth 負向驗證、GHCR 候選、signed Smoke、IAM／Secret／路由讀回及正式發布核准。實際啟用 Owner 模型／Chat 功能前，仍須有 Chat→Gateway→PostgreSQL/SSE 持久化、跨 Owner 隔離、模型 entitlement／成本授權與真實 runtime 證據；缺少證據保持 BLOCKED。不移除 Google 登入功能與安全限制。

**未解決問題不豁免。** 2026-10-11 Owner A 人工觀察與 PostgreSQL 0/3、無新對話回合的證據不一致，依實際 runtime 持續追查，不得因此結案。

適用範圍：doc/spec.md、doc/acceptance.md、doc/todo.md、docs/cicd-ghcr-actions-runbook.md、docs/p0-owner-chat-runbook.md。Workflow 應分開顯示 manual_oauth_gate=NOT_REQUIRED 與 automated_oauth_* 真實 PASS/FAIL/NOT_VERIFIED。
