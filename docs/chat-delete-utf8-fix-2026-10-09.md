# Chat deletion and UTF-8 fixes — 2026-10-09

User requested permanent thread deletion, correct Chinese message display, and diagnosis of messages that remain queued. User subsequently deferred model authorization.

- Sidebar delete action requires confirmation. DELETE /v1/threads/:id derives owner from verified identity. A transaction removes approvals, events, turns and the thread; surviving forks are detached. RUNNING turns block deletion. Dispatch claims lock the parent thread as well as the turn to serialize with deletion.
- Flutter JSON/SSE responses decode bodyBytes as UTF-8. Chat declares UTF-8 in JSON/SSE Content-Type. Existing message contents are not rewritten: the observed encoding defect is in response decoding.
- When dispatcher/owner authorization is unavailable, message submission returns dispatch_unavailable before persistence. UI displays a specific error and retains composer text. Authorized requests target their exact owner/thread/turn for request-bound dispatch; no background work after a Cloud Run HTTP response.
- No owner was allowlisted and no runtime dispatch setting was enabled. Actual model replies remain deferred per user instruction.

Local evidence: Node build PASS; Chat API/dispatch 22 tests PASS; Flutter 13 widget tests PASS; Flutter analyze PASS. Full Node run: 57 PASS, one DB acceptance skipped locally, one pre-existing Codex native test failed on Windows EBUSY while deleting its temporary plugin clone directory. PostgreSQL acceptance coverage includes owner denial, RUNNING rejection, permanent removal of rows and preservation of forks; CI must execute it against its disposable DB.

Deployment and runtime evidence for `f5e24eea43ba36c35f965fd1e6c899155813d838`:

- Full quality/PostgreSQL/security and public GHCR publication [37941973511](https://github.com/tommylin15/omniAgent/actions/runs/37941973511): PASS. Node [37941973613](https://github.com/tommylin15/omniAgent/actions/runs/37941973613) and Flutter [37941973335](https://github.com/tommylin15/omniAgent/actions/runs/37941973335): PASS.
- Zero-traffic candidates [37942620679](https://github.com/tommylin15/omniAgent/actions/runs/37942620679): PASS. Chat `00042-six`, Gateway `00033-nax`, Shared `00021-peh`.
- Automatic current-candidate smoke [37942878996](https://github.com/tommylin15/omniAgent/actions/runs/37942878996): PASS. Candidate error response additionally read back as `application/json; charset=utf-8`.
- No production promotion: user requested completing the P0 batch before unified validation/promotion. Formal serving revisions remain Chat `00039-rik`, Gateway `00030-coy`, Shared `00019-puf` at 100%.
- No human-owned thread was permanently deleted by the agent. Permanent row removal is proven in disposable PostgreSQL CI; human browser deletion/Chinese display and actual provider inference remain live acceptance tasks.
