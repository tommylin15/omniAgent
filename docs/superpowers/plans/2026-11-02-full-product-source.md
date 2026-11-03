# Full product source implementation plan

> Execution: implement the approved P0/P1/P2 scope in this workspace, with independent agents for disjoint files. User overrides incremental commits and test execution: write tests with implementation, review all source, push the complete source batch, then execute tests/CI/deployment/acceptance. Do not mark product completion before runtime evidence.

**Goal:** Complete the source paths for the existing TODO, preserving authenticated Owner isolation and disabled deployment gates where runtime configuration is unavailable.

**Architecture:** Keep Flutter → Chat API → private Gateway/Agent Worker. PostgreSQL owns live state, budgets, approvals and jobs. Credentials remain in Secret Manager; external domains are consumed only through bounded API/MCP contracts. GCS stores owner-bound artifacts, an archive contract must return verified Iceberg receipts, and BigQuery remains an explicit bounded optional analytics integration.

**Tech stack:** Existing TypeScript, Node, pg, GoogleAuth, MCP client and Flutter; reuse dependencies.

**Spec:** `doc/todo.md`, `docs/agent-loop-roadmap.md`, `docs/architecture.md`, `docs/credential-resolver.md`, `docs/risk-remediation-plan.md`.

## Global constraints

- Only this repository and its own runtime evidence; GitHub access only `tommylin15/omniAgent`.
- Every query and tool grant derives Owner identity server-side. No raw credentials in Chat/events/logs/browser responses.
- No fabricated resource IDs, provider models, rates, billing proof or acceptance receipts. Missing configuration fails closed.
- Keep production dispatch, paid routing, new worker, mutations, archive and analytics OFF until their runtime gates pass.
- No automatic destructive retention, Secret retirement, external publishing or cross-project DB/storage access.
- No tests/builds/deployments before source review and GitHub push; authored test status is NOT_RUN.

## Review focus

- Repeated or uncertain provider/tool requests must not produce duplicate charge or mutation.
- Lease expiry/reclaim must not let an old worker commit a checkpoint or repeat unknown effects.
- Owner changes must not reuse credentials, MCP grants, artifacts, jobs or prior UI state.
- Missing prices/usage/credentials/schema or unverified archive receipts must not become zero/success.
- New deployment resources must not be created implicitly by ordinary app startup or source push.

## Source tasks

- [ ] Agent runtime: bounded loop extension; `services/agent-worker/`; `services/chat-api/agent_runs.ts`; migration `011`; tests for isolation, leases, approvals, cancellation and limits. Parent connects authenticated Chat endpoints and Flutter progress.
- [ ] Paid models: Gateway paid Gemini provider/model verification, planner function-calling adapter and durable budget in migration `012`; tests for missing gates, replay, usage and unknown outcomes. Parent connects signed Gateway dispatch without altering legacy Lite consumers.
- [ ] Data/jobs: Chat artifact/archive/job/workflow modules; migration `013`; tests for ownership, digest/reconciliation, lease fencing and shadow-only workflows. Parent connects APIs and deployment configuration.
- [ ] Credentials/providers: complete bounded Owner/provider/profile resolver and recoverable credential replacement/revocation; Groq Chat runtime, Gateway, DB constraint and Flutter wiring; update callers and negative tests.
- [ ] Admin/UI: configuration/readiness metadata without secret values, entitlement/draft distinctions, run/job/artifact/credential interfaces and accessible error/loading states; tests written without execution.
- [ ] Delivery: explicit additive migrations and worker/job deployment controls; one source-review report covering all changed consumers, schemas, config, tests and failure paths; no interim push.
- [ ] Bulk delivery: `/ponytail-review`, fix required findings, commit/push the complete source batch with NOT_RUN validation status.
- [ ] Post-push validation: inspect exact-SHA CI, run full suites and disposable PostgreSQL acceptance, fix/review/push failures, then candidate/runtime/integration gates. Keep external prerequisites explicitly blocked until real evidence exists.

## Progress and rulings

- 2026-11-03: source files and authored tests now cover the source tasks above; the checkboxes remain release/validation gates, not inferred PASS. Exact delivered scope, native Codex evidence limitation and external configuration blockers are recorded in `docs/source-checkpoint-2026-11-03.md`.
- Source-only review found worker image publication and text archive compatibility gaps; source fixes and regression tests were authored. Cross-device cancellation tombstones, explicit storage/job/analytics quotas and Shared execution-ID compatibility were also included.
- Ruling: preserve the user's stop-after-code instruction by publishing the unverified source checkpoint to `codex/full-product-source`; main-only CI/deployment does not run on this branch push. No tests/builds are run before that checkpoint. Product acceptance remains pending.
- Ruling: native Codex acknowledgments do not expose individual model inference evidence. Keep those counts/tokens/cost explicitly unverified instead of counting Chat turns as provider calls.

- Baseline: main `cbdc541`; pre-existing local change only records the requested development/push/test sequence in `doc/todo.md`.
- Scope confirmed by user: all P0, P1 and P2.
- Ruling: P2 settings without approved numeric policy stay explicit required configuration, rather than arbitrary retention/cost defaults. Implement interfaces, validation and operational code; missing resources remain runtime blockers.
- Ruling: CI already runs after a main push. No pre-push test commands will be run; review findings and unexecuted test status will be reported accurately.
