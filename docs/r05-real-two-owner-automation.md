# R05 真實雙 Owner 自動化驗收

本驗收不恢復真人手動 OAuth 登入測試。執行入口：
`.github/workflows/omniagent-r05-real-two-owner.yml`、
`scripts/r05_real_two_owner.py`。

## 安全前提與資料

驗收需要兩組**不同 Google 使用者**、目標 Web OAuth Client ID 有效、
未過期的 Google ID Token。僅由 GitHub Actions 的受保護 Secret
`R05_OWNER_A_GOOGLE_ID_TOKEN` 與
`R05_OWNER_B_GOOGLE_ID_TOKEN` 供應，不會寫入 repo、artifacts 或日誌。
Token 的正常有效期限有限，請勿把短期 ID Token 當成可長期無人值守的
refresh 憑證。**服務帳號 ID Token、測試 verifier、PostgreSQL Owner mapping
均不是合格替代品。** 尚未配置兩組有效憑證時獨立 workflow 必須 FAIL，
留 `NOT_VERIFIED` / `NO_TWO_DELEGATED_GOOGLE_USER_TOKENS_CONFIGURED` 收據；
既有一般 CI 與 0% candidate 不受此獨立 gate 中斷。

## 安全執行約束

只使用 exact SHA 的 GHCR Cloud Run Chat 0%-traffic candidate；
正式服務維持唯一 100% serving，候選 `CHAT_DISPATCH_ENABLED` 不得 true，
BYOK management 不得啟用。Chat 本身經 Google 憑證簽章驗證並從
`issuer + sub` 對應 PostgreSQL Owner UUID。測試確認 Owner A/B
`/v1/me` 合法且映射不同，建立兩筆獨特的無訊息試驗 Thread，
驗證跨 Owner thread GET、SSE、active、latest、DELETE 均 404；
驗證任意 `X-OmniAgent-Owner-Id` 不會升權。試驗 Thread 最後由
各自合法 Owner 刪除，若任何清理失敗不得宣告 PASS。
**絕不呼叫** messages POST、Codex、Gemini、BYOK 或 Dispatch API，
不建立真實使用者訊息，也不直接更改 PostgreSQL 欄位。
注意：目前 `ChatStore.owner()` 會更新 `owners.last_seen_at`，因此
不得把這次驗收宣稱為 DB zero writes。

## 獨立驗收狀態

- 本地/CI fixture 可驗證 harness 的條件拒絕、兩組相異身份、
  權限負例及 Thread 清理，**但不等於 real OAuth E2E**。
- 真實雙 Google user boundary `PASS` 必須有獨立 workflow、
  已驗證 Google 用戶 Token、不同 Owner ID、候選實際 HTTP 回應
  及正式流量 readback。
- Turn receipt、Codex session/workspace/approval/cancel、實際 Gemini
  Provider 端到端屬其他 gates，本 workflow 不擅自宣稱 PASS。
- 真正長期無人值守的合法 Google user token 取得機制尚待授權。
  **不得偷用其它專案的使用者 token、Secret 或 OAuth 帳戶。**
