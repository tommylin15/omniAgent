# UI cutover runbook

## Current state

Split Phases 0–5 are closed as migration checkpoints. Janus remains the sole live Chat writer. Its canonical API revision is `janus-api-00154-74s` at 100% traffic, image `api@sha256:3be7c05489ab6329632a94372f8c311f7de5a0f4ab485ec012d8340eb2c13d9c`. The image packages the pinned pre-split Web artifact. GCP dev build `d46fd92e-1bcf-482b-b4fd-ee59c4ef8c38`, zero-traffic candidate acceptance `d61ac9ee-616f-4a37-8010-d1b7f6ddab07`, and canonical acceptance `123683e7-6fa8-444e-a00d-e12af07045c8` succeeded. Both acceptance runs checked health, `/app`, `/app/admin`, the legacy Chat route, and User/Admin OAuth client IDs. This does not cut over omniAgent.

## Carry-forward phases

- **Phase 6 — Deployment Planning Gate:** planning only. Define Cloud Run/Build, Secret, service account, IAM, OAuth, env, routing, service-to-service auth, rollback, and any paid-resource changes. Do not deploy or change security/cost boundaries.
- **Phase 6B — Real Dev Deployment / Acceptance:** after approvals, validate omniAgent OAuth/owner isolation, runtime dispatch, providers, Janus bounded context, Skills/MCP, streaming/reconnect/cancel/approval, historical owner mapping/export-copy-verify as required, and at least one real end-to-end dev flow. The standalone client must use only omniAgent `/v1/threads`; never fall back to Janus `/api/v1/me/chats...`.
- **Phase 7 — Janus Cleanup:** only after Phase 6B acceptance and explicit cleanup approval. Remove only replaced generic assistant ownership; preserve Janus domain/data/API/MCP/UI responsibilities and migration history.
- **Phase 8 — Documentation / stale-reference gate:** align active docs with actual ownership/runtime/path state while preserving archive/history facts.
- **Phase 9 — Final Acceptance:** verify both repos, CI/tests, deployment, live runtime, integration, storage ownership, docs, stale references and rollback. Only a Phase 9 PASS may be called `OMNIAGENT SPLIT COMPLETE`.

Keep Janus legacy Chat API and historical data intact until an approved Phase 6B write-routing cutover. The older `usefulness-rollback` image `sha256:058d442f...` was already absent on 2026-09-22; the user accepted that old image rollback is not guaranteed. For an API-only Janus rollback, confirm the desired old revision image still exists before using the Janus [dev deployment runbook](https://github.com/tommylin15/janus-omniforge/blob/main/doc/runbook-dev-deploy.md). After Chat write cutover, rollback requires verified reverse synchronization; no such procedure has been accepted yet.
