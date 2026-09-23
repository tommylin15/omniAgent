# Phase 6 — deployment plan（planning only）

狀態：2026-09-23 的文件盤點；未執行 GCP 即時查詢、deployment、IAM、Secret、OAuth、routing、資料寫入權切換或付費資源建立。Janus 仍是唯一 live Chat writer；omniAgent 的 Chat API、UI、`omni_chat` schema 尚未部署。以下名稱與拓樸是待核准方案，不代表資源已存在。

分類標籤：`existing dev reuse`＝沿用現有 dev 能力；`config change`＝未來需改程式、建置或設定；`new resource`＝未來需建立獨立資源；`explicit approval required`＝涉及安全、費用或 live routing，執行前須取得另一次明確同意。

| 項目 | 分類 | 部署時的規劃與界線 |
| --- | --- | --- |
| Cloud Run | `new resource` · `config change` · `explicit approval required` | 平行建立暫稱 `omniagent-chat`（Chat API 與靜態 Flutter UI 同源）和 `omniagent-agent-gateway`；名稱待核定。Chat/UI 同源需補靜態檔服務與容器打包，避免瀏覽器跨來源授權問題。保留 `janus-api` 與 `janus-agent-gateway`，不直接改名或刪除。新服務先以無 Chat live traffic 的候選路徑驗收。 |
| Cloud Build | `existing dev reuse` · `config change` | 沿用既有 dev Cloud Build worker，omniAgent 自備 build config；Chat API 尚缺獨立 Dockerfile，Flutter Web 需打包進同源服務。初次採手動建置，不以建立新 trigger 作前提。Janus 的 Cloud Build 設定與部署腳本繼續只部署 Janus。 |
| Artifact Registry | `existing dev reuse` · `config change` | 可沿用既有 dev `janusai-poc` repository，使用獨立 omniAgent image 名稱並以 immutable digest 部署；部署前確認 repo 寫入權與 image retention 不會清掉可回滾 digest。不建立新 repository 為預設。不得啟用或呼叫 Artifact Analysis、Container Scanning 或 occurrence API。 |
| Service account | `new resource` · `explicit approval required` | 為 Chat 與 Gateway 各設獨立 runtime 身分；不把 `janus-user-api` 或 `janus-agent-gateway` 身分當作 omniAgent 的永久身分。建置身分優先評估現有 Cloud Build 路徑；若跨 repo 的 GitHub WIF 限制不允許，另提最小授權方案。 |
| IAM | `config change` · `explicit approval required` | 只給新身分必要的 Secret 讀取、checkpoint bucket 存取與服務呼叫權；Janus PostgreSQL／GCS／Iceberg 不授權 omniAgent 直接存取。需要 Cloud Run invoker 綁定時以目標服務限定；若 Janus API 仍允許公開調用，`run.invoker` 不能替代內部 route 的應用層 token 驗證。 |
| Secrets | `new resource` · `config change` · `explicit approval required` | 建立獨立的 omniAgent DB credential、provider bundle、Codex owner auth 所需 Secret；僅遷入已核准的最小欄位，不複製整包 Janus credential。Secret 值不得進入前端、image、Cloud Build substitution、命令參數或 log；版本切換須保留可恢復的前版。 |
| OAuth | `new resource` · `config change` · `explicit approval required` | 建立獨立的 omniAgent Google Web client，登記實際 UI origin，client ID 同時作 UI 登入與 Chat API 的 user audience；不共用 Janus Admin client。是否需要 client secret 取決於核定的登入流程。Janus 的 User／MCP OAuth client、callback 與 ChatGPT→Janus MCP 路徑維持 Janus 管理。 |
| Environment variables | `config change` · `explicit approval required` | Chat：`CHAT_DATABASE_URL`（Secret 注入）、`OMNIAGENT_GOOGLE_CLIENT_ID`、`CHAT_INTERNAL_AUDIENCE`、`CHAT_INTERNAL_ALLOWED_EMAILS`；UI build：`OMNIAGENT_API_BASE_URL`、`OMNIAGENT_GOOGLE_CLIENT_ID`；Gateway：provider bundle、`CODEX_OWNER_SECRETS`、`AGENT_CHECKPOINT_BUCKET`、MCP 設定。Janus context boundary：`INTERNAL_ASSISTANT_AUDIENCE`、`ASSISTANT_SERVICE_ACCOUNTS`。實際 URL、audience、允許身分與 Secret version 須在部署前核對。 |
| Janus service-to-service auth | `existing dev reuse` · `config change` · `explicit approval required` | 沿用 Janus 已有 `/internal/v1/assistant/context:resolve` 的 Google ID token audience／caller allowlist 驗證。omniAgent 透過 metadata server 取指定 Janus audience 的 service ID token；Janus 只允許核准的 omniAgent SA。使用者端 sources／preview 仍傳每次請求的 Janus user token；不可將某位使用者 token 放進多 owner Gateway 的全域 MCP 設定。現有 service token 未把傳入 owner 密碼學綁定，live 使用前須驗證 owner mapping 與權限邊界。 |
| Routing | `config change` · `explicit approval required` | omniAgent UI 只呼叫自己的 `/v1/threads`，不得 fallback 到 Janus `/api/v1/me/chats...`。Janus 保留 bounded context API/MCP 與既有 ChatGPT MCP connector。Phase 6B 第一階段不切 Chat write ownership、不移走 Janus legacy Chat UI/API；候選驗收後的任何使用者入口或流量切換另案核准。 |
| Storage／write ownership | `existing dev reuse` · `config change` · `explicit approval required` | `omni_chat` migrations 的目標是獨立 omniAgent database；可先評估在既有 dev `e2-micro` PostgreSQL VM 上建立獨立 logical database 與 role，須確認容量、隔離、權限、備份及 Free Tier 限制。Janus `016_private_assistant_storage.sql` 歷史及原 conversation／Private Iceberg 資料不刪不搬；歷史 owner mapping 與 export/copy/verify 尚未完成。Phase 6B 第一階段 Janus 保持唯一 writer，不啟用 dual write。 |
| Rollback | `existing dev reuse` · `config change` · `explicit approval required` | 切流前保留 Janus legacy Chat writer、資料、API 與可用 image digest，候選部署需先做 0% 流量與回切驗證。舊 `usefulness-rollback` image 已缺失，不能僅憑 revision tag 宣稱可回滾。Chat write ownership 一旦切換，回 Janus 需要經驗證的 reverse-sync 與 owner／event 對帳；目前沒有該方案，因此不得切寫入權或清理 Janus generic Chat code。 |
| Paid-resource impact | `existing dev reuse` · `new resource` · `explicit approval required` | 預設不建第二台 PostgreSQL VM、負載平衡器、新 Artifact Registry repository、自動 trigger、snapshot／HA／replica 或掃描服務；但新 Cloud Run 用量、Cloud Build、image storage、Secret active versions/access、資料庫容量與 checkpoint storage 仍可能產生費用。沿用既有 project、registry、bucket 或 VM 不保證帳單為零；建立／擴容前須審核 billing budget 與資源限制。 |

## 既有 Janus 資源的處置

- `janus-agent-gateway`：保留作 Janus 現有相依與回滾路徑；不直接改成 omniAgent 服務。新的 omniAgent Gateway 平行部署並完成真實整合後，才另案檢討舊服務。
- Janus `deploy-dev.sh`、`deploy-agent-gateway-dev.sh`、`cloudbuild.yaml`：保留給 Janus；omniAgent 建自己的 build/deploy 描述，不在舊腳本加入跨 repo 發布責任。
- `janus-agent-provider-bundle`：保留 Janus 的 Agent／Mart／Ingestion consumer；不把混合的 PostgreSQL／provider 欄位整包授權給 omniAgent。所需 provider credential 另以最小範圍的新 Secret 管理。
- `janus-codex-owners-bundle`：保留 Janus 舊 Gateway 相容與回滾；目前文件記載無 enabled auth version。omniAgent owner auth 另設獨立 Secret 與 owner mapping，不假設舊 bundle 可直接沿用。

Janus 只提供穩定、已驗證身分的 bounded API/MCP capability；它不呼叫 omniAgent、不引用 omniAgent 原始碼、不等待 omniAgent 才能執行 ingestion、研究、投資 API 或 Janus MCP。移除 `MCP_GATEWAY_URL` 等舊整合設定只能在 Janus 相依查證、獨立驗收與回滾證據完備後另案進行，避免形成 Janus→omniAgent 反向 runtime dependency。

## Phase 6B 入口條件

第一階段預設 **不得切 Chat write ownership**。先完成 omniAgent OAuth／owner isolation、runtime dispatch、Janus bounded context、Skills/MCP、歷史 owner mapping／export-copy-verify、兩 repo 回歸與真實 dev 整合；再另外驗證 reverse-sync rollback 並取得 routing／安全／費用決策。Janus legacy Chat writer 在此之前保持啟用。本文件通過只代表 planning 完成，不代表 Phase 6B、部署或 split 完成。

依據：[Janus 部署 runbook](https://github.com/tommylin15/janus-omniforge/blob/main/doc/runbook-dev-deploy.md)、[Secret 清單](https://github.com/tommylin15/janus-omniforge/blob/main/doc/secret_list.md)、[omniAgent 儲存遷移](chat-storage-migration.md)、[Janus connector](janus-connector.md)、[UI cutover runbook](runbook-ui-cutover.md)。資源狀態沿用文件與本機程式證據，實際 GCP 現況仍須於未來部署決策前唯讀核對。
