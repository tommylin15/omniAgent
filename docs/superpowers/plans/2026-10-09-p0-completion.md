# P0 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Complete the approved P0 batch and validate it before unified production promotion.

**Architecture:** Reuse existing Gateway lifecycle APIs and PostgreSQL owner boundaries. Protect preview, promotion and recovery with a common deployment lock, fresh exact-version checks and sanitized evidence. Never repeat uncertain provider effects automatically.

**Tech Stack:** Node/TypeScript, PostgreSQL, Flutter/Dart, Python standard library, GitHub Actions, GHCR, Cloud Run.

**Spec:** ../../p0-completion-design-2026-10-09.md

## Global Constraints

- Only tommylin15/omniAgent; no external repositories or storage internals.
- Keep 1a8e575 formal allocations until the batch passes acceptance.
- No fabricated owner, credential, endpoint or PASS; no resource retirement.
- ponytail-review before every commit/push; no new dependencies.

## Review Focus

- Concurrent route changes must not be overwritten during recovery.
- Provider effects must not repeat after persistence uncertainty or HTTP retry.
- Approval/cancel binding must reject foreign owners and stale handles/digests.
- Process loss must become an explicit error with durable replay preserved.
- Missing browser/paid-call/MCP prerequisites must remain open.

### Task 1: Preview protection and recovery

Files: scripts/verify_preview_route.py, scripts/update_preview.py, tests/test_preview_route.py, tests/test_update_preview.py, candidate and current-candidate-smoke workflows.
Interfaces: update_preview.run(candidate, release_sha, evidence_path) returns sanitized validation/recovery evidence; fail closed on protected-state or stale-source drift.
- [ ] Add failing tests for post-update probe failure, successful restoration, restore failure and concurrent drift.
- [ ] Implement guarded tag update and original-route restoration, health/ready/assets/anonymous checks and evidence on every outcome.
- [ ] Share deployment concurrency group; upload sanitized evidence even on failure.
- [ ] Run Python regression and review.

### Task 2: Durable native turn lifecycle

Files: migration 003, Chat storage/dispatcher/server, Gateway compatibility fixes, Node/PostgreSQL tests.
Interfaces: owner-bound runtime binding and cursor stored on turns; dispatcher start/poll/resolve/cancel uses existing signed Gateway APIs.
- [ ] Add failing owner/binding/idempotency/expiry/process-loss tests.
- [ ] Implement persistence before acknowledgement, exact-turn calls, approval forwarding and safe cancellation.
- [ ] Preserve existing non-Codex dispatch and terminal event behavior.
- [ ] Run Node and disposable PostgreSQL acceptance; review.

### Task 3: UI lifecycle and bounded MCP

Files: Chat API/page, Flutter tests, existing MCP contracts and runtime integration tests.
- [ ] Test approval forwarding, active cancellation, reconnect cursor and owner isolation failures.
- [ ] Connect UI state to durable turns and enforce bounded MCP owner/session operations.
- [ ] Run Flutter analyze/widget tests/Web build and contract checks.

### Task 4: Protected release and real rollback

Files: scripts/ghcr_release.py, release workflow, Python release tests, runbook.
Interfaces: explicit source SHA plus immutable primary/fallback revision manifests; acceptance evidence required before apply.
- [ ] Test stale SHA/digest, split traffic, concurrent drift, partial failure and recovery.
- [ ] Implement guarded snapshots, candidate/private health checks, real GHCR fallback rehearsal and final primary promotion/readback.
- [ ] Preserve all tags and config; omit retention/deletion.
- [ ] Run regression and review.

### Task 5: Unified acceptance and promotion

- [ ] Obtain approved real owner UUIDs, Codex Secret refs, bounded provider-call allowance and real MCP endpoint contract.
- [ ] Review, commit/push batch; exact-SHA full CI and immutable GHCR candidates.
- [ ] Prove signed real provider reply -> owner PostgreSQL events -> replay, approval/cancel/MCP and process-loss behavior.
- [ ] Operator fixed-preview A-B-A browser OAuth/isolation acceptance.
- [ ] Validate preview recovery and actual formal rollback; promote batch only after gates pass.
- [ ] Save evidence and reconcile TODO/acceptance; explicitly list unmet gates.

## Execution Ledger

- 2026-10-09: user approved design and requested continuous implementation. Initial deletion/UTF-8 fix f5e24ee full CI, 0% candidates and smoke PASS; no formal promotion. Runtime inputs remain pending.
- Ruling: execute inline in the current checkout and stage only scoped files — user requested continuing this project; preserve unrelated untracked inventory and preview draft until reviewed.
