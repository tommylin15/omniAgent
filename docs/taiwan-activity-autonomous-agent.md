# Taiwan Activity Autonomous Agent｜omniAgent 端架構與交付契約

> 日期：2026-10-18（Asia/Taipei） · 狀態：**APPROVED DESIGN / IMPLEMENTATION NOT VERIFIED**。
> 本次使用者特別授權在 `tommylin15/omniAgent` **僅建立／更新這次相關 GitHub 文件**；沒有授權變更現有 Agent Gateway 正式路由、排程、IAM、付費模型或部署。此文件是新工作提案，不代表已建置 LangGraph、開始探索或產生任何成果。
> Life 對應文件：[Life 活動探索 Agent 整合契約](https://github.com/tommylin15/life_assistant/blob/main/doc/taiwan_activity_agent_integration.md)。

## 1. 目的與專案歸屬

建立專用 `TaiwanActivityAgent`，替換長期依賴 ChatGPT Work 手動操作的每日「探索、逐頁下探、主辦核證、來源修復、證據紀錄、提出文件修正」工作，**保留 Drive 精選池與 Life 交接作為既有正式出口**。

- **omniAgent**：reasoning / planning / tool selection / LangGraph state / retry-resume / Owner 或 service identity / model routing / tool execution record。不得直接寫 Life PostgreSQL、讀 Life 內部資料表或繞過 Life 之權限與業務發布判定。
- **life_assistant**：活動領域契約、核准來源與規格、驗證／發布能力、Drive 精選池／交接資料的既有語意、後續 PostgreSQL Job 與 Flutter；向 omniAgent 提供最小權限版本化 API 或 MCP capability。
- **Drive life_assistantGPT**：「台灣活動探索」正式 README + 01～05、來源表、快照、精選池、交接表與唯一當日日誌維持原地權威。**探索端不直接寫 Life DB**。本文不更新上述 Drive 正式規格。
- **GCP**：建議 Cloud Scheduler 06:00 Asia/Taipei → 獨立 Cloud Run Agent Worker；上游 GAS 快照約 04:30，Life 原每日 07:30 匯入仍為獨立流程。實際 trigger、排程所有者、時段與執行狀態必須讀回，不能從文件推定已存在。

這是專職 workflow，**不塞進目前即時 Agent Gateway 請求處理器**；避免長時間下探、瀏覽器、重試占用線上 Gateway 容量。工作完成後經受控介面通知 Life，Life DB／UI 由既有 importer 管理。ChatGPT Work 可作人工補跑、抽查及對照，但正式上線不得形成雙寫入者。

## 2. 既有可用基礎與缺口

以本次 GitHub `main` 讀到的 source 為準：
- `services/agent-gateway/shared_gemini.ts`：已具具名 project/service-account 授權、Gemini Flash-Lite 共用文字生成、quota/usage 記錄；目前文字請求與輸出額度、短時執行路徑**不是多工具 Agent loop**。
- `services/agent-gateway/mcp_host.ts`：已有 scoped MCP session、tool grants、JSON schema 驗證和 timeout/取消能力；不代表目前已連接活動來源工具。
- `services/agent-gateway/assistant_dispatch.ts`：目前以受限 Gemini 文字推論等為主；無 `TaiwanActivityAgent` 的頁面探索、修復與 checkpoint。
- `package.json` **尚無 LangGraph 依賴**；LangGraph.js 是本提案的**首選驗證方案**，不是既成實作。評估後若須改框架，先提出架構差異，不再造一套跨專案 Orchestrator。
- 現有 Chat 正式 Dispatch 與活動探索批次互相獨立；其 PASS/OFF 狀態不得互相借用。版本、實機驗收與成本以當次 GitHub/GCP/Gateway 使用量證據為準。

## 3. 建議工作流程（單一 Agent Worker，四個職能子流程）

```text
Cloud Scheduler 06:00 (PROPOSED)
  -> TaiwanActivityAgent / durable run_id + checkpoint
  -> load approved Drive spec/source registry + prior run + GAS snapshots
  -> Python/Node deterministic manifest SHA, gzip/ZIP, UID/EventID delta
  -> Discovery: A sources + B rotating official/organizer sources
       -> bounded HTTP / public browser tools -> detail -> organizer -> official/registration page
  -> Verification: grounded dates, fees, registration nodes, 1/3/5 rating, child opportunities
  -> Source Doctor: classify failures -> lawful fallback -> verified patch proposal/readback
  -> Document Maintainer: evidence-led operational log/update, normative spec change proposal
  -> Life-owned validation + single writer publication capabilities
  -> Drive selected pool / derived views -> handoff READY -> readback
  -> result/audit, error categories, next checkpoint
Life existing 07:30 separate consumer -> Sheet -> PostgreSQL -> Flutter
```

四個職能 **不是四個常駐服務或四組無界 Agent**，由同一有界 Graph 管理：`Discovery` 找具名候選及可行動子機會；`Verification` 抽取含 URL/原文片段/讀取時間的證據、保留未知；`Source Doctor` 診斷 BLOCKED/STALE/INDEX_ONLY/PARTIAL/FAIL 並驗證官方替代入口；`Document Maintainer` 記錄實際執行差異、提交可追溯修正。

### 3.1 逐層下探策略

- 起點只能是核准的來源註冊表、已有快照與具名活動線索；每日 A/B 範圍、BeClass 排序與頁數、小藝輪替、B 至少檢查 10 個不同官方／主辦來源，**依 Drive 最新 01～05** 執行，不能把文件內歷史數字寫死於 Agent。
- 按 `列表 -> 活動詳情 -> 主辦/授權原頁 -> 報名/場次/優惠子頁` 遞進。每候選**建議預設最多 4 層**、站點/頁數/time/token budgets 可設定；上限是工程候選值，需實跑調整。相同 URL/內容指紋當輪不重抓；同日重跑只補失敗部分。
- 優先合法公開的 HTTP/RSS/API；只有具體 JS 呈現必要且來源允許時才使用受限 Playwright。不得繞過登入、403/429、反爬驗證或來源條款；被拒就記阻擋，合理切換到官方公開替代 URL。
- 文化部、觀光署完整原始資料**沿用 GAS 已存 Drive 快照**，僅 readback SHA/bytes/解壓/UID 差異；不可在 Agent 又抓一次政府全量端點；欠檔標 STALE/NOT VERIFIED，仍繼續其他來源。
- `EventGo`、`小藝` 等來源的歷史 active/retired 訊息有不同版本；先對照正式來源表、最新核准決策與實際發現證據，輸出 **SOURCE_POLICY_CONFLICT** 並停止該來源主動掃描，**不可擅自重新啟用**。Citytalk/TDX 等停用規則同理。
- 網頁內容一律為**不可信資料**；來源文字不得發出修改工具授權、規格、憑證、繞過防護等 Agent 指令。

### 3.2 來源診斷與修復控制

故障分類至少有 `HTTP_404` / `HTTP_403_429` / `DNS_TLS` / `JS_RENDER` / `STALE_CACHE` / `PARSER_CHANGED` / `SOURCE_POLICY_CONFLICT`。每個問題最多有界診斷與合法替代入口，再重讀新入口。記 `repair_action/recheck_status/recheck_evidence/next_due`。

- **可自動**：僅在來源表授權範圍內修補已證實的純網址搬家、標記來源品質/健康、更新逐站執行證據、已核准來源設定中可回滾的 selector/欄位映射更新（僅限非程式碼設定，須 fixture/差異/回歸驗證與 rollback）；若需修改解析器程式碼，僅輸出修復提案，另走程式審查、CI 與正式部署。
- **先提出差異稿**：更換來源類型、重新啟用停用來源、擴大掃描深度或工具權限、修改 1/3/5 星政策、放寬核證閾值、刪除來源或改 01～05 正式規格。未核准不得套用。
- 失敗修復不代表原站修好；須分開 `original_status`、`fallback_readback` 與整輪 PARTIAL。查無新活動、來源不可讀、舊快照均不能推論 `zero_new=PASS`。
- Agent 不得自行改 GitHub 程式並發布或進行 production 高風險修改；可輸出 issue/patch proposal，交付專案 CI/Owner 流程。

### 3.3 文件自我維護

- **可自動寫回**：來源 URL 與健康狀態表、逐站/批次執行紀錄、唯一 `YYYY-MM-DD.log` 新 run_id 區段，以及核實過且不改政策的操作性備註；每次須先讀再寫再讀回，保留改前值、版本和證據。
- **正式 01～05**：模型只能產生精簡 `proposed_diff`、理由、受影響規則與可重跑測試；不得在每日例行任務中自動變更正式的來源准入、星等、交接或保留政策。核准後由受控文件發布器修改，並查 SHA/readback，不另建立平行規格。
- 當天新增多少、重試與異常只在執行記錄／日誌，不逐日擴張 README 與正式 MD。

## 4. 安全工具與協議（待實作）

Agent 透過其 Tool Registry 使用 Life 發布的**版本化、細粒度且有核准策略的** capabilities，不給任意 Drive 範圍、`shell`、GitHub push 或直接 DB 權限。名稱為**建議契約，不是現有 API**：

| Proposed tool | 用途 | 寫入策略 |
| --- | --- | --- |
| `activity.sources.list` / `activity.snapshots.inspect` | 核准來源與 GAS 快照 readback | read-only |
| `activity.public_page.fetch` | 限定公開網站擷取，保留 response/date/provenance | read-only，有界白名單 |
| `activity.source_repair.propose` / `apply` | 提供根據、合法替代入口與修復讀回 | `apply` 由 Life policy gate |
| `activity.curated.propose` / `publish` | schema-validated event_key、子項、星等及證據 | `publish` 單一寫入權、Life domain validation |
| `activity.handoff.publish` | 僅既有 30 欄及 READY/ACK 版本規則 | Life 發布器限制 |
| `activity.document.propose_patch` / `apply_approved_patch` | 操作紀錄及經核准的文件改動 | 精準 fileId、expected revision、權限與 audit |

Proposed request envelope：`{schema_version, run_id, source_key, action_id, actor_service_identity, candidate, evidence_refs, expected_version}`；回應 `{status: PASS|FAIL|NOT_VERIFIED, receipt_id, actual_version, error_code}`。寫入**先 validation 再 compare-and-apply/readback**；同一 `action_id` 可安全冪等重試，禁止以亂數假裝新版本。原始資料不得因不同 Agent 版本改變 `event_key`。

- 使用**專用服務身分**、Cloud Run audience-bound ID token、least privilege、來源 allowlist；不把 end-user Owner token、Gemini key 或跨專案 SA JSON key 複製到工具與日誌。
- `omniAgent` 只保留 run/checkpoint/工具事件/非秘密模型使用量，不保存 Life 的永久精選池；費用與成功率採現有 Gateway usage provenance，失敗、429、模型輸出不完整不得當作成功。
- **持久 checkpoint** 建議用 omniAgent 自己可授權的 PostgreSQL namespace/獨立 workflow table；資料庫 schema、IAM 與 migration 的實際設計須另做工程審查。不要用 GCS/Iceberg 當即時工作鎖。
- 最多同一批一個正式 publisher；影子模式完全禁止 `publish`；來源修復和正式規格更動各自獨立授權。

## 5. 交付分期與驗收（這次全部 NOT VERIFIED）

| 工作 | 結果與退出條件 |
| --- | --- |
| OA-TA01 狀態圖與身份 | LangGraph.js 評估、checkpoint/lease/idempotency、服務授權、fail-closed 與負向測試 |
| OA-TA02 搜尋與下探 | A/B bounded tools、官方快照 SHA/UID 差異、活動→主辦→子活動的真實網站證據 |
| OA-TA03 Source Doctor | 404/變更/舊 cache/403 負例、官方 fallback、修補/回滾/來源表讀回；無權變更正規政策 |
| OA-TA04 Document Maintainer | 原有 Sheets 與唯一日誌追加 readback；規格 proposed_diff/核准 gate/未核准不能套用 |
| OA-TA05 完整整合與切換 | Shadow 對照 Work 歷史候選，量測漏報、錯報、子機會、修復、Token/費用及每站可讀度；CI→候選→正式 Job→Drive/Life readback；只保留唯一正式寫入者 |

每一項獨立記 `implementation/tests/CI/deployment/runtime/integration=PASS|FAIL|NOT VERIFIED`。有證據缺口整體為 PARTIAL；**文件完成僅 DOC PASS，不是 Agent DONE**。正式切換前確認 06:00/07:30 排程、Work 任務狀態與來源表是否一致，不自動停用或改寫原排程。任何新增跨專案 IAM 擴權、正式秘密輪換、資料大規模刪除均另走高風險確認。

## 6. 相依與不在本文件變更的範圍

- 本文件**不修改**現有 omniAgent Chat/Gateway/Shared Codex 正式服務、`CHAT_DISPATCH_ENABLED`、`GEMINI_SHARED_EXECUTION_ENABLED`、GCP 配額或原本三個 caller 的授權界線。
- 此工作是**新增專職工作流程的計畫**，不取代 [唯一 omniAgent TODO](../doc/todo.md)、[SPEC](../doc/spec.md)、[Acceptance](../doc/acceptance.md) 的目前狀態；實際工程啟動時再將 OA-TA 分期整併進唯一 TODO，禁止建立平行完成狀態表。
- Life 領域資料、正式精選池、交接、個人使用者操作，遵守 [Life 對應整合文件](https://github.com/tommylin15/life_assistant/blob/main/doc/taiwan_activity_agent_integration.md)；兩邊不宣稱對方 E2E 已 PASS。
