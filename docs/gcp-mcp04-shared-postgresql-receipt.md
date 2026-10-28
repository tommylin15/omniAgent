# GCP_MCP-04｜重用 Omniagent PostgreSQL 的 live migration 收據

日期：2026-10-28（Asia/Taipei）。

此為 Omniagent 既有共用 PostgreSQL 上的 GCP MCP 隔離 OAuth 資料結構，**不是**變更 Omniagent 現行聊天、router 或資料表的功能。

## 實際驗收

- [唯讀原始環境 Run 40638814057](https://github.com/tommylin15/omniAgent/actions/runs/40638814057)：以既有 GitHub OIDC → `omniagent-ci` → GCP IAP 連線到既有 `janus-postgres-dev` 的 `janus-postgres` 容器；讀回 `omniagent_chat`、SSL on、`omni_chat` schema 存在、HBA errors=0。GCP MCP 專用角色／schema／table 在此次前均不存在。
- [版本化 migration Run 40639161229](https://github.com/tommylin15/omniAgent/actions/runs/40639161229)：`success`，來源 `infra/postgres/migrations/009_gcp_mcp_oauth_isolated.sql`。新增 `gcp_mcp_oauth_app NOLOGIN`，`gcp_mcp_oauth.gcp_mcp_oauth_kv` 空表、index 與最小必要的專用權限，保留原 `omni_chat` 表數不變，新角色 HBA=0。
- [Migration 後網路與 DB readback Run 40639306333](https://github.com/tommylin15/omniAgent/actions/runs/40639306333)：角色仍 NOLOGIN、schema/table 已存在，Chat 現行修訂版 `omniagent-chat-00130-zat` Direct VPC 使用 `janusai-lake-poc` / `janusai-lake-poc-uscentral1`、`private-ranges-only`；DB VM 同 network/subnet、狀態 RUNNING。既有 GCP MCP Cloud Run `multi-project-gcp-devops-mcp-00001-djw` 仍維持 100% Bootstrap 流量。

## 安全邊界與尚未執行

- 未建立任何新 PostgreSQL database、Firestore、VM、VPC、Secret Manager 或付費服務。
- 未產生或傳遞 DB role password，未設定 `LOGIN`、HBA 或防火牆，不允許 GCP MCP 存取 `omni_chat`，未修改原有 Chat 資料。
- 未部署 GCP MCP Private Candidate，Google OAuth、Secret Manager 和 runtime DB connection 尚未經 live 驗收。
- 進入下一階段以前，需核准 GCP MCP 專用 Secret 資源／版本與相應最小權限，執行 role password／LOGIN／HBA／VPC/TLS 正反驗證、Google OAuth Credential/Owner allowlist；若涉及新增付費 GCP 資源，須先取得 Owner 明確授權。

GCP MCP Gateway 的直接程式、完整架構及部署文件以獨立 repo [multi-project-gcp-devops](https://github.com/tommylin15/multi-project-gcp-devops/blob/main/docs/GCP_MCP_04_SHARED_POSTGRES.md) 為準。
