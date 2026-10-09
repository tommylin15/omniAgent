# Chat deletion and UTF-8 fixes — 2026-10-09

User requested permanent thread deletion, correct Chinese message display, and diagnosis of messages that remain queued. User subsequently deferred model authorization.

- Sidebar delete action requires confirmation. DELETE /v1/threads/:id derives owner from verified identity. A transaction removes approvals, events, turns and the thread; surviving forks are detached. RUNNING turns block deletion. Dispatch claims lock the parent thread as well as the turn to serialize with deletion.
- Flutter JSON/SSE responses decode bodyBytes as UTF-8. Chat declares UTF-8 in JSON/SSE Content-Type. Existing message contents are not rewritten: the observed encoding defect is in response decoding.
- When dispatcher/owner authorization is unavailable, message submission returns dispatch_unavailable before persistence. UI displays a specific error and retains composer text. Authorized requests target their exact owner/thread/turn for request-bound dispatch; no background work after a Cloud Run HTTP response.
- No owner was allowlisted and no runtime dispatch setting was enabled. Actual model replies remain deferred per user instruction.

Local evidence: Node build PASS; Chat API/dispatch 22 tests PASS; Flutter 13 widget tests PASS; Flutter analyze PASS. Full Node run: 57 PASS, one DB acceptance skipped locally, one pre-existing Codex native test failed on Windows EBUSY while deleting its temporary plugin clone directory. PostgreSQL acceptance coverage includes owner denial, RUNNING rejection, permanent removal of rows and preservation of forks; CI must execute it against its disposable DB.

Deployment and runtime evidence: PENDING.
