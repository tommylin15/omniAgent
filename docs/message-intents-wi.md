# Durable message intent source contract

2026-11-03：source 與測試程式已新增；本輪尚未執行測試、compiler、migration、CI 或 runtime 驗收。`CHAT_DURABLE_INTENTS_ENABLED=true` 才可由 Chat 啟用；預設 OFF。正式啟用前必須套用 `020_message_intents.sql` 到 omniagent_chat、核對 Chat DB role 權限及 readiness。

`MessageIntentStore.prepare(owner,thread,key,content)` 在模型／訊息 POST 前預留精確 UUID key 與 SHA256 content digest；不儲存 prompt。每個 Owner/thread 最多一個 prepared intent，既有 QUEUED／RUNNING turn 亦拒絕新 key。同 key 不同 content 拒絕，同 key cancelled 不能復活；同 key prepared／consumed 可讀回同一收據。

`active(owner,thread)` 只回 key、contentDigest、state、turnId，優先 prepared，否則回最近 consumed receipt。另一裝置應先檢查該 turn 的 durable receipt，不能用新 UUID 自動重送不明訊息。digest 不可用作猜測或讀取別人的內容；所有端點仍須使用 verified OAuth Owner。

`cancel(owner,thread,key)` 先鎖同一 thread，再鎖 intent，僅 prepared 可變 cancelled。已 consumed 不能撤銷或清空 key。Cancelled receipt 在 thread 存在期間保留；刪除 thread 才 cascade 刪除 intent，不以 timeout 自動解除未知請求。

`ChatStore.message` 的整合順序必須是同一 PostgreSQL transaction：

1. `SELECT` active Owner/thread `FOR UPDATE`（既有行為）。
2. 檢查既有 message-key turn；同 digest 返回原收據，不再 dispatch。
3. Flag ON 時呼叫 `requirePreparedMessageIntent(tx,owner,thread,key,content)`。
4. 建立 turn／user event。
5. Flag ON 時呼叫 `consumeMessageIntent(tx,owner,thread,key,content,turnId)`。
6. COMMIT；任何 helper 失敗連 turn 一起 ROLLBACK。

prepare、cancel 和 message 共用 thread row lock，因此「先取消、後遲到 POST」會被拒絕；若 message 已先消耗，cancel 回 conflict，不能假裝模型沒有執行。Store 不自行 dispatch 或刪除 turn。Server 應把 `MessageIntentConflict`／`MessageIntentNotFound` 分別映射 409／404，並在 flag ON 的 readiness 檢查新表。

後續真 PostgreSQL 併發、跨 Owner、取消與遲到 POST、跨裝置重新登入、不完整 2xx、斷線與同一 exact SHA UI 驗收仍待執行；測試 fixture 不是 runtime 證據。
