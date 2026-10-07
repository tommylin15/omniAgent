# omniAgent WBS

> Implementation baseline reviewed: `main@75336a248381d935c7b23dd8afab06f5e9c4151a`.
> Architecture revision: 2026-10-07.
> Completion is implementation + test + deployment/integration evidence, never document presence alone.

## 0. Governance

| WBS | Work item | Status | Exit evidence |
| --- | --- | --- | --- |
| 0.1 | Maintain current ownership/source/runtime truth by exact commit | ONGOING | source + CI + runtime evidence |
| 0.2 | Do not treat design approval as implementation | ONGOING | status language preserved |
| 0.3 | Keep direct Janus DB/GCS/Iceberg access forbidden | ONGOING | source/integration scan |

## 1. Closed split checkpoints

| WBS | Work item | Status |
| --- | --- | --- |
| 1.1 | independent omniAgent repo/build boundary | DONE |
| 1.2 | generic contract/security split | DONE |
| 1.3 | bounded Janus connector boundary | DONE-CHECKPOINT |
| 1.4 | Chat API/storage ownership target | DONE-CHECKPOINT |
| 1.5 | generic Flutter Chat extraction | DONE-CHECKPOINT |

## 2. Phase 6B runtime critical path

| WBS | Work item | Status | Exit condition |
| --- | --- | --- | --- |
| 2.1 | exact-head CI/test | OPEN | Node + Flutter tied to deploy commit |
| 2.2 | independent Chat DB/role + apply 001/002 | OPEN | real schema/read-write evidence |
| 2.3 | deploy Chat API + Flutter candidate | OPEN | revision/image/smoke without routing cutover |
| 2.4 | real browser identity | OPEN | correct audience + stable owner mapping |
| 2.5 | durable Chat→Gateway dispatcher | OPEN | retry-safe claim→provider→events path |
| 2.6 | approval/cancel/reconnect | OPEN | real E2E |
| 2.7 | MCP/tool E2E | OPEN | real endpoint + owner/session isolation |
| 2.8 | multi-owner isolation | OPEN | positive + negative tests |
| 2.9 | routing/write cutover | BLOCKED | all blockers + rollback + explicit approval |

## 3. Provider and credential plane

| WBS | Work item | Status | Exit condition |
| --- | --- | --- | --- |
| 3.1 | Gemini runtime | VERIFIED-DEV-PROBE | full Chat E2E still required |
| 3.2 | OpenRouter runtime | VERIFIED-DEV-PROBE | full Chat E2E still required |
| 3.3 | Codex runtime | PARTIAL | owner auth + execution isolation + real turn |
| 3.4 | direct Groq adapter/runtime | OPEN | provider adapter + tests + real dev E2E |
| 3.5 | Credential Resolver contract | OPEN | owner/provider/mode/profile/entitlement resolution |
| 3.6 | owner BYOK storage flow | OPEN | secret stored only in approved secret store; replace/revoke/validate |
| 3.7 | platform credential entitlement | OPEN | unauthorized owner fails closed |
| 3.8 | credential audit metadata | OPEN | source/profile ID recorded without secret |
| 3.9 | same-platform-key multi-owner isolation | OPEN | memory/tool/artifact/archive/session separation proven |
| 3.10 | Codex owner-isolated execution context | OPEN | isolated auth/session/thread/workspace/process/MCP context |

## 4. Data lifecycle and lakehouse

| WBS | Work item | Status | Exit condition |
| --- | --- | --- | --- |
| 4.1 | keep PostgreSQL authoritative for live state | TARGET-DESIGN | dispatcher/storage code and tests conform |
| 4.2 | define measured large-payload threshold | OPEN | workload evidence + accepted threshold |
| 4.3 | GCS owner-bound artifact layer | OPEN | authenticated refs + digest + retention rules |
| 4.4 | asynchronous Iceberg archive writer | OPEN | idempotent event/history archive + reconciliation |
| 4.5 | archive schema for conversation/worker/tool/usage/audit | OPEN | versioned schema + owner/source IDs |
| 4.6 | partition/compaction strategy | OPEN | time + bucket(owner) baseline measured/tuned |
| 4.7 | historical read/reconstruction path | OPEN | authorized thread history reconstructs without direct client lake access |
| 4.8 | hot-data pruning gate | BLOCKED | archive verify + retention/delete approval |
| 4.9 | BigLake/BigQuery analytics integration | OPEN / APPROVAL-REQUIRED | cost/resource approval + bounded query evidence |

## 5. UI/control surfaces

| WBS | Work item | Status | Exit condition |
| --- | --- | --- | --- |
| 5.1 | existing Chat source | DONE-CODE | deployed E2E still open |
| 5.2 | credential profile/status UI | OPEN | owner sees Personal vs Platform without secret exposure |
| 5.3 | BYOK add/replace/revoke flow | OPEN | backend-only secret handling + masked status |
| 5.4 | platform credential entitlement UI | OPEN | only entitled users can select it |
| 5.5 | Groq runtime/model UI | OPEN | only after provider API contract exists |
| 5.6 | Tools/Skills/Data Sources management | OPEN | real APIs only, no fabricated state |

## 6. Migration, rollback and final acceptance

| WBS | Work item | Status | Exit condition |
| --- | --- | --- | --- |
| 6.1 | historical owner mapping/export if required | OPEN | deterministic reconciliation |
| 6.2 | reverse-sync/post-cutover rollback | OPEN/BLOCKING | rehearsed no-loss/no-dup recovery |
| 6.3 | Phase 7 cleanup | BLOCKED | replacement proven first |
| 6.4 | Phase 8 docs/stale-reference reconciliation | IN PROGRESS | active docs match runtime |
| 6.5 | Phase 9 final acceptance | BLOCKED | all required gates PASS |
| 6.6 | declare `OMNIAGENT SPLIT COMPLETE` | BLOCKED | explicit Phase 9 PASS only |
