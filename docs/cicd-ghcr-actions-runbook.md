# omniAgent CI/CD — current production runbook

**Delivery mechanism verified from GitHub main on 2026-10-17; historical runtime PASS receipts remain dated below.** New delivery uses **GitHub Actions → public GHCR immutable digests → Cloud Run**. Historical `cloudbuild*.yaml` and `docs/cicd-v2-*` are not the new release path. The existing three Cloud Run services in project `gen-lang-client-0593591102`, region `us-central1`, are Chat, Agent Gateway and Shared Codex.

## Current independently verified checkpoint

- Formal P0-V **Gateway-only Gemini activation PASS**: [Actions #38559065522](https://github.com/tommylin15/omniAgent/actions/runs/38559065522).
- Separate **revision-retention execution PASS**: [Actions #38574373341](https://github.com/tommylin15/omniAgent/actions/runs/38574373341), 31 actual revisions deleted; 31 old tagged URLs removed.
- **Independent GCP inspection PASS**: [#38498845455 attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/38498845455/attempts/3), Chat `00069-tep`, Gateway `00076-pog`, Shared `00046-naj` each Ready, 100% traffic and exactly 10 revisions. Gateway Gemini enabled; Chat model Dispatch **disabled**. Gateway/Shared retain private IAM.
- This does **not** mean full Chat application acceptance is complete; see [TODO](../doc/todo.md) and [Acceptance](../doc/acceptance.md).

## Normal change delivery

1. Record exact `main` commit SHA. Execute Node build/test, Flutter analyze/test/build, Python contract and disposable DB fixture tests on the **same** version. A workflow marked success with critical steps skipped does not pass a release gate.
2. Use [GHCR publish workflow](../.github/workflows/omniagent-ghcr-publish.yml) to verify three images' OCI source labels and immutable `sha256` digests. All GHCR release packages must be publicly pullable; public repo visibility alone is insufficient.
3. Use [Cloud Run zero-traffic candidate workflow](../.github/workflows/omniagent-ghcr-cloudrun-candidate.yml): compare exact SHA, ensure protected Secret refs/identity/VPC/environment and unchanged formal traffic; each new candidate must be Ready and signed smoke-tested.
4. Carry out the **specific change's** live positive and negative acceptance: authenticated caller, owner entitlement, unsigned denial, cross-project denial, terminal persisted DB/turn if Chat is enabled, response schema and model cost bounds. No IAM broadening or paid provider retry by inference.
5. The current [candidate smoke workflow](../.github/workflows/omniagent-ghcr-current-candidate-smoke.yml) gates the [automatic production release workflow](../.github/workflows/auto-release.yml) on an explicit **successful, repo-scoped candidate smoke** `workflow_run`. The auto release checks readiness, promotes and performs retention. Manual `workflow_dispatch` is also available and enters the *same readiness logic*; no assumption that a manual dispatch proved the smoke. The previous one-shot P0-V Gateway release workflow was **retired** and is retained only in Git history, not a callable current entrypoint.
6. Verify at least one Ready safe fallback and post-release operational readback. On failed promotion, use guarded recovery and report partial mutation honestly. The Owner previously waived mandatory *manual rollback rehearsal*; this does not waive working fallback, tests or failure readback.
7. Retain at most ten Cloud Run revisions **only after** verifying serving/rollback images and all still-in-use tagged URLs. Use fresh inventories on every deletion; never reuse old hardcoded counts. Do not equate 10 revisions with 10 validated releases.

## Controls and legacy entrypoints

- Only eight current workflow YAML files exist; the historical one-shot marker, P0-V rollout, per-migration, R01 and R05 workflows were removed. Their old receipts remain in Git history and Actions. **Do not restore obsolete workflows just to satisfy historical tests**; maintain coverage for active scripts and workflows instead. For the accepted main release mechanism, inspect `ci.yml`, `omniagent-ghcr-publish.yml`, `omniagent-ghcr-cloudrun-candidate.yml`, `omniagent-ghcr-current-candidate-smoke.yml`, and `auto-release.yml`.
- A `workflow_run` chain can be skipped after newer main changes or an explicit event/authorization gate; inspect individual step results, source SHA, actual Cloud Run revision and traffic readback. Example: [#38568825058](https://github.com/tommylin15/omniAgent/actions/runs/38568825058) overall success did not execute production promotion.
- No new Cloud Build trigger invocation, Artifact Registry publish or GCS CI evidence writes; old Cloud Build/GCS/AR assets must be inventoried individually with business data/DB backup exclusions before separate deletion approval.
- Use Workload Identity Federation and scoped service accounts; redact secrets, raw tokens, PII and user prompts from logs. Cloud Run Chat public login/UI does **not** bypass Chat API user-token authorization. Gateway and Shared Codex remain private.
- Manual Google OAuth login acceptance and A→B→A human testing are `NOT_REQUIRED`; feasible automated JWT issuer/audience/subject checks, IAM/signed negative tests and Owner isolation remain mandatory.

## Canonical endpoints

- Chat: `https://omniagent-chat-2oo7qbkd5q-uc.a.run.app/`
- Fixed Preview: `https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app/` — tag binding and tested Owner entitlement must be read back after any change.
- Gateway private base and signed Google ID-token audience: `https://omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app`
- Shared Codex private base: `https://omniagent-shared-codex-2oo7qbkd5q-uc.a.run.app`

## Release receipt fields

Log `source_sha`, `CI_run`, `GHCR_digest`, `candidate_revision`, `formal_before`, `formal_after`, `auth_negative`, `business_acceptance`, `rollback_or_fallback`, `revision_count`, `run_attempt`, `end_time`, `final_status`. Distinguish `NOT_RUN`, `PASS`, `PARTIAL`, `BLOCKED`, `NOT_VERIFIED` and `RECOVERY_FAILED`. No missing field may be invented.

Historical detailed executions remain accessible through [Git history](https://github.com/tommylin15/omniAgent/commits/main), Actions artifacts and dated evidence documents. Project-specific risks are tracked in [risk audit](project-risk-audit-2026-10-14.md).
