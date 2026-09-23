# omniAgent WBS

> Baseline: `main@4a5f74ca60c0859a8727568290b388101cbae6c1`.
> This WBS measures completion by implementation + test + deployment/integration evidence, not by code or document presence alone.

## 0. Governance and baseline

| WBS | Work item | Status | Exit evidence |
| --- | --- | --- | --- |
| 0.1 | Establish split baseline and ownership boundary | DONE | Phase 0 checkpoint closed. |
| 0.2 | Keep Janus live routing/write ownership unchanged until cutover approval | DONE/ONGOING | Current Janus live writer preserved. |
| 0.3 | Maintain source/evidence traceability by commit | ONGOING | Every gate references exact source/deployment evidence. |

## 1. Migration checkpoints 0–5

| WBS | Work item | Status | Notes |
| --- | --- | --- | --- |
| 1.1 | Independent omniAgent build/test/package boundary | DONE | Closed Phase 1 checkpoint. |
| 1.2 | Generic contract/security split | DONE | Closed Phase 2 checkpoint. |
| 1.3 | Bounded Janus context client boundary | DONE-CHECKPOINT | Client boundary exists; live integration deferred. |
| 1.4 | Chat API/storage ownership target | DONE-CHECKPOINT | Target API/schema exists; live writer cutover deferred. |
| 1.5 | Flutter generic Chat UI extraction | DONE-CHECKPOINT | Source split complete; deployed UI cutover deferred. |

## 2. Phase 6 deployment planning

| WBS | Work item | Status | Notes |
| --- | --- | --- | --- |
| 2.1 | Define Cloud Run / Cloud Build / Artifact Registry topology | DONE | Approved planning record exists. |
| 2.2 | Define IAM/Secret/OAuth boundaries | DONE-PLAN | Execution still requires explicit approval/evidence. |
| 2.3 | Define Chat storage/write ownership and rollback boundary | DONE-PLAN | Janus remains writer; reverse-sync remains open. |
| 2.4 | Define no-direct-Janus-data-access constraint | DONE | Must remain invariant. |

## 3. Phase 6B real dev deployment and acceptance

### 3.1 Gateway candidate

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.1.1 | Build independent Gateway image | VERIFIED-DEV | Image build succeeded at Phase 6B checkpoint. |
| 3.1.2 | Deploy private candidate Gateway | VERIFIED-DEV | Candidate Cloud Run revision exists. |
| 3.1.3 | Real Gemini dispatch | VERIFIED-DEV | Real provider response + terminal event observed. |
| 3.1.4 | Real OpenRouter dispatch | VERIFIED-DEV | Real provider response + terminal event observed. |
| 3.1.5 | Codex managed owner auth | OPEN | Requires enabled owner auth secret + owner-isolated login/session/turn verification. |

### 3.2 Chat API / UI candidate

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.2.1 | Build Chat API + Flutter Web same-origin image | VERIFIED-DEV-BUILD | Image built; build alone is not deployment acceptance. |
| 3.2.2 | Configure independent omniAgent Google Web client | PARTIAL | Client exists; actual deployed origin/login acceptance required. |
| 3.2.3 | Google ID-token UI sign-in source integration | DONE-CODE | Latest main implements web sign-in button/token handoff; exact-head CI/live proof still required. |
| 3.2.4 | Deploy Chat/UI candidate | OPEN | Must deploy without taking Janus live traffic. |
| 3.2.5 | Execute candidate smoke (`/health`, `/`, protected `/v1/threads`) | OPEN | `cloudbuild-chat-candidate-verify.yaml` exists; execution evidence required. |
| 3.2.6 | Real browser Google login | OPEN | Must validate origin, audience, token acceptance, logout/re-login behavior. |

### 3.3 Chat database

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.3.1 | Create independent logical DB + role in approved dev PostgreSQL | OPEN | `setup-omniagent-db-dev.sh` exists; execution evidence required. |
| 3.3.2 | Apply `001_chat_ownership.sql` | OPEN | Transactional migration + schema verification. |
| 3.3.3 | Apply `002_skill_storage.sql` | OPEN | Transactional migration + schema verification. |
| 3.3.4 | Validate owner/thread/turn/event/approval/Skill isolation | OPEN | Real DB multi-owner acceptance. |
| 3.3.5 | Validate backup/capacity/cost boundary | OPEN | Must not assume existing VM implies zero cost/risk. |

### 3.4 Durable Chat→Gateway execution path

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.4.1 | Define claim/lease state for queued turns | OPEN | Exactly-once effect / retry-safe design required. |
| 3.4.2 | Implement dispatcher/worker | OPEN | Code change required outside this documentation task. |
| 3.4.3 | Authenticate Chat/worker→Gateway | OPEN | Service identity + request binding. |
| 3.4.4 | Persist Gateway events back through internal Chat API | OPEN | Event idempotency + terminal state proof. |
| 3.4.5 | Crash/retry/cancel recovery | OPEN | Fault-injection acceptance required. |

**Critical path:** Phase 6B cannot be considered end-to-end Chat acceptance while WBS 3.4 is open.

### 3.5 Event streaming / reconnect

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.5.1 | Cursor-based replay | DONE-CODE | Chat storage/API implemented. |
| 3.5.2 | UI finite SSE parsing | DONE-CODE | Current client parses a completed response. |
| 3.5.3 | Continuous/bounded live stream semantics | OPEN | Current UI polls every two seconds. |
| 3.5.4 | Reconnect without duplicate/missing events | OPEN-LIVE | Must prove browser/network interruption behavior. |

### 3.6 Approvals and cancellation

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.6.1 | Approval binding/security logic | DONE-CODE | Owner/turn/digest/expiry binding exists. |
| 3.6.2 | Approval persistence/UI | DONE-CODE | Storage and Flutter controls exist. |
| 3.6.3 | Queued-turn cancellation | DONE-CODE | Works before runtime integration. |
| 3.6.4 | Runtime-aware approval/cancel E2E | OPEN | Requires WBS 3.4 + real runtime. |

### 3.7 MCP / tools

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.7.1 | Gateway MCP Host + discover/call/cancel/disconnect routes | DONE-CODE | Internal routes exist. |
| 3.7.2 | Real omniAgent MCP discovery/call | OPEN | Must exercise a real configured MCP endpoint. |
| 3.7.3 | Owner/session isolation | OPEN-LIVE | Multiple-owner negative tests required. |
| 3.7.4 | Public management API/UI | OPEN | Current UI intentionally says management API not wired. |

### 3.8 Janus bounded context integration

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.8.1 | Authenticated Janus context client | DONE-CODE | No direct DB/GCS/Iceberg imports. |
| 3.8.2 | Wire context resolution into real turn path | OPEN | Must remain bounded and owner-authorized. |
| 3.8.3 | Multi-owner mapping/isolation | OPEN | Cannot use one global user token as acceptance. |
| 3.8.4 | Preserve ChatGPT→Janus MCP independence | PARTIAL | Metadata/guards checked; ChatGPT UI discovery/invocation still open. |

### 3.9 Skills

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.9.1 | Skill schema/revisions/state | DONE-CODE | Migration/storage methods exist. |
| 3.9.2 | Credential-field persistence guard | DONE-CODE | Storage sanitization exists. |
| 3.9.3 | Skill public API | OPEN | No public management routes in Chat API. |
| 3.9.4 | Skill management UI | OPEN | Placeholder only. |
| 3.9.5 | Historical Skill migration, if required | OPEN | Export/copy/verify required before any cutover claim. |

### 3.10 Historical data and rollback

| WBS | Work item | Status | Dependency / exit condition |
| --- | --- | --- | --- |
| 3.10.1 | Owner mapping export | OPEN | Deterministic mapping/reconciliation. |
| 3.10.2 | Historical conversation copy, if approved/required | OPEN | Non-destructive copy + counts/digests. |
| 3.10.3 | Historical verification | OPEN | Owner/thread/event reconciliation. |
| 3.10.4 | Reverse-sync/post-cutover rollback | OPEN/BLOCKING | Must be proven before switching live writer. |
| 3.10.5 | Chat write-routing cutover | BLOCKED | Blocked by 3.4, 3.8, 3.10.4 and explicit approval. |

## 4. Phase 7 Janus cleanup

| WBS | Work item | Status | Exit condition |
| --- | --- | --- | --- |
| 4.1 | Identify generic assistant ownership replaced by omniAgent | BLOCKED | Phase 6B live acceptance first. |
| 4.2 | Remove only replaced Janus generic paths | BLOCKED | Preserve investment/domain/API/MCP/history responsibilities. |
| 4.3 | Run both-repo regression and stale import/path scans | BLOCKED | No regressions, rollback path retained as required. |

## 5. Phase 8 documentation/stale-reference gate

| WBS | Work item | Status | Exit condition |
| --- | --- | --- | --- |
| 5.1 | Align README/spec/WBS/TODO/UI/runbooks | IN PROGRESS | This `doc/` set establishes a current baseline. |
| 5.2 | Reconcile `docs/` point-in-time records vs current state | OPEN | Preserve history; mark superseded current claims explicitly. |
| 5.3 | Scan stale service/path/ownership references | OPEN | Both repositories. |

## 6. Phase 9 final acceptance

| WBS | Work item | Status | Exit condition |
| --- | --- | --- | --- |
| 6.1 | Exact-head build/test/CI | OPEN | All required suites pass with explained skips only. |
| 6.2 | Deployment/runtime inventory | OPEN | Revisions/images/traffic/identities match spec. |
| 6.3 | E2E Chat/provider/MCP/Janus context/OAuth/owner isolation | OPEN | Real paths pass. |
| 6.4 | Storage/migration/rollback reconciliation | OPEN | No unverified writer rollback risk. |
| 6.5 | Documentation and stale-reference acceptance | OPEN | Active docs match runtime. |
| 6.6 | Declare `OMNIAGENT SPLIT COMPLETE` | BLOCKED | Allowed only after all Phase 9 gates pass. |
