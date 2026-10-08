# OmniAgent CI/CD V2 execution plan

User-approved scope: private `tommylin15/omniAgent`, main push only, project
`gen-lang-client-0593591102`, region `us-central1`. Execute inline; no additional
design approval is required by the user's explicit execution instruction.

## Architecture

Reuse the completed `tommy-github` second-generation connection and repository.
Separate Push CI and explicit Release Cloud Build triggers run quality gates; Release builds immutable SHA images and deploys
zero-traffic candidates to the three existing services, accepts the candidates,
promotes only after every required gate, reads back revisions/digests/traffic,
and computes a conservative image cleanup plan. Flutter Web is bundled in Chat.
No worker service exists; do not create one. Preserve runtime identity, IAM,
OAuth, provider contracts, database and external consumer repositories.

## Tasks

- [x] Add tested change detection, stale/duplicate build guards, candidate
  orchestration, live gates, promotion/readback and recovery safeguards.
- [x] Move existing Node, security, PostgreSQL acceptance, Flutter and hygiene
  gates into `cloudbuild-v2.yaml`; keep PR checks and manual repair workflows.
- [x] Create/read back the regional main-only CI and manual Release triggers with the existing
  `omniagent-ci` identity; make only narrowly necessary build permissions.
- [ ] Execute a real main push, inspect Cloud Build and candidates, capture
  evidence and resolve failures within the authorized boundary.
- [ ] Retire conflicting Actions push deployment only after V2 works; preserve
  manual repair. Dry-run image deletion against all runtime references first.
- [ ] Update SPEC/TODO/status/runbook/evidence; ponytail-review before every
  commit and push. CLOSED requires every mandatory live gate.

## Review focus

Tests must cover deleted files/shared dependencies, missing baseline, stale SHA,
duplicate build, referenced/tagged images, traffic drift, wrong digest and
partial promotion recovery. Missing credentials or unimplemented business
integration must fail closed, never become a synthetic PASS.

## Initial inventory (2026-10-08)

Baseline `4a09faa8231a0e8e20d3b9279a89cb765965fddc`. Existing services:
`omniagent-chat`, `omniagent-agent-gateway`, `omniagent-shared-codex`.
Flutter's existing release artifact is inside `services/chat-api/Dockerfile`.
No standalone worker or Flutter hosting deployment was found.
Connection installation COMPLETE; repo Private. Scanning disabled.
At the historical checkpoint `omniagent-provider-bundle` was absent.
**Superseded by the 2026-10-08 owner decision:** use only the existing
`omniagent-bundle` with Provider fields, `mcp_owner_signing_key`, and
`chat_database_url`. Refer to SPEC §7 and the runbook; unified-bundle
version creation and live acceptance remain OPEN.
Durable Chat dispatcher and browser two-owner acceptance remain open in TODO.

## Execution ledger

- Read current control set, deployment runbook, workflows and runtime metadata.
- User's direct full-execution authorization overrides skill approval pauses.
- Initial cloud inventory is read-only; no external repository was read/edited.
- Added user directive: Push CI only, explicit SHA Release, independent Shared lock,
  bounded cost. User separately approved three narrowly scoped IAM additions.
- Independent review fixed lock-generation race, cost-counter ordering, atomic
  release journal, explicit SHA/CI Ready checks, runtime-free CI preparation and
  real Artifact Registry image schema. Tests cover the reported safety failures.
- Local TypeScript build PASS. Node 32 PASS/1 skipped/1 Windows EBUSY cleanup
  failure; Linux Cloud Build will provide the authoritative source gate.
- Native rerun: Node 33 PASS/1 isolated PostgreSQL test skipped; EBUSY did not
  recur. V2 safety suite 9 PASS; Python compilation and YAML parse PASS.
- Ponytail review: replace four duplicate publishers with one manual Cloud Build
  entry; remove redundant final component membership branches. No new dependencies.
