# omniAgent split execution status

## Completed checkpoints

- [x] Phase 0 — Baseline / freeze: repository state and split baseline were established before migration work.
- [x] Phase 1 — Skeleton / copy-first: omniAgent owns an independent build/test/package boundary for the copied generic Agent runtime.
- [x] Phase 2 — Contract / security split: generic Agent contracts/security are separated from Janus domain policy and context ownership.
- [x] Phase 3 — Janus ↔ omniAgent wire boundary: the authenticated bounded Janus context client/contract checkpoint is complete; direct Janus DB/GCS/Iceberg/internal imports are forbidden.
- [x] Phase 4 — Chat API / storage ownership checkpoint: omniAgent owns the target Chat API, `omni_chat` schema, owner-mapping contract, and Skill storage contract. Historical copy and live write ownership are intentionally deferred to deployment/cutover phases.
- [x] Phase 5 — UI extraction: generic Chat UI/widget tests live in `apps/agent_app`; Janus User App source owns investment User/Admin UI only. Janus API pins the pre-split User App Web artifact from commit `5d24d0638b2667c6c4e9b68620223adef5c08e8d`; dev revision `janus-api-00154-74s` serves canonical traffic with the legacy Chat UI. [Janus CI](https://github.com/tommylin15/janus-omniforge/actions/runs/35705589439) and [omniAgent CI](https://github.com/tommylin15/omniAgent/actions/runs/35705540272) passed.

Phase 0–5 are closed as migration checkpoints. Their completion does **not** claim omniAgent live cutover or overall split completion.

## Carry-forward execution gates

- [ ] Phase 6 — Deployment Planning Gate: planning only. Enumerate Cloud Run, Cloud Build, Secret, service account, IAM, OAuth, env, routing, service-to-service auth, rollback, and any new paid resources. Classify each item as existing-dev reuse, config change, new resource, or explicit-approval required. Do not deploy or change security/cost boundaries in this phase.
- [ ] Phase 6B — Real Dev Deployment / Acceptance: after required approvals, deploy to the real parallel-live dev environment and verify provider/runtime dispatch, Codex managed auth, Gemini/OpenRouter, MCP discovery/call, streaming, cancellation, reconnect, approvals, owner isolation, real omniAgent → Janus bounded API/MCP, and at least one real end-to-end path. ChatGPT → Janus MCP must remain independently functional. Historical owner mapping/export-copy-verify and write-routing cutover are performed here only if required by the approved plan and must remain non-destructive until verified.
- [ ] Phase 7 — Janus Cleanup: only after Phase 6B live acceptance and explicit cleanup approval. Remove only Janus generic assistant ownership already replaced by omniAgent; preserve KEEP-JANUS domain/data/API/MCP/UI responsibilities and migration history. Run Janus/omniAgent regressions plus stale import/path scans.
- [ ] Phase 8 — Documentation Migration / Stale-reference Gate: align active README/WBS/spec/TODO/UI/runbooks/service/package docs with the actual ownership, runtime and paths. Preserve archive/history facts; remove stale current-state ownership claims.
- [ ] Phase 9 — Final Acceptance: re-check both repositories, tests, CI, deployment, live runtime, integration, UI, contracts, storage ownership, documentation, stale references and rollback. Only Phase 9 PASS may be labeled `OMNIAGENT SPLIT COMPLETE`.

## Current live state

Janus remains the sole live Chat writer and keeps its applied migration history and historical conversation/private data intact. The pinned pre-split Janus Web artifact preserves the current legacy Chat path until an approved Phase 6B cutover. omniAgent OAuth, live runtime dispatch, real Janus context integration, Skills/MCP live integration, historical data copy, write-routing cutover and post-cutover rollback are therefore carry-forward work, not unfinished Phase 3–5 checkpoint scope.

See [UI ownership](ui.md), [Janus migration](migration-from-janus.md), [storage gate](chat-storage-migration.md), [Janus connector](janus-connector.md), and [deployment/cutover runbook](runbook-ui-cutover.md).
