# omniAgent — document control

**Current checkpoint: 2026-10-14 (Asia/Taipei).** The formal Gemini Gateway route, three-service Cloud Run/IAM readback, and revision retention (10/10/10) have independent PASS receipts. **Full Chat product release remains PARTIAL** because production Chat Dispatch is OFF and multi-Owner/integration acceptance is incomplete.

## Authority order

1. Actual GitHub `main` implementation plus Cloud Run/DB/runtime evidence; use exact SHA and timestamps.
2. CI, builds, image digest and tests for that same SHA; a skipped stage is not a successful execution.
3. Approved architecture and requirements: this `doc/` control set and formal documents under the **OmniAgentGPT** Drive scope only.
4. Historical `docs/` source runbooks, evidence and archival checkpoints (not current status by default).

When sources conflict, cite both, explain dates and gaps. Missing evidence is NOT_VERIFIED, not automatically PASS or FAIL.

## Current document map

| Single current document | Responsibility |
| --- | --- |
| [SPEC](spec.md) | Product contract and technical requirements |
| [TODO](todo.md) | **Only active, prioritized backlog** |
| [Acceptance](acceptance.md) | **Only active acceptance matrix and scoped runtime gates** |
| [WBS](wbs.md) | Stage/workstream ownership and exit definitions |
| [UI](ui.md) and [assets](visual-assets.md) | Flutter visual/accessibility and Twin Beast contract |
| [CI/CD runbook](../docs/cicd-ghcr-actions-runbook.md) | GitHub Actions/GHCR/Cloud Run release and fallback |
| [P0-V Gateway contract](../docs/shared-gemini-vertical-slice.md) | Three callers, model limits, endpoint and verified state |
| [Owner Chat runbook](../docs/p0-owner-chat-runbook.md) | Error correlation, DB receipt and scoped E2E |
| [Risk register](../docs/project-risk-audit-2026-10-14.md) | Confirmed risks, conditional risks, missing verification |
| [OAuth policy](../docs/oauth-automated-acceptance-policy.md) | No manual login gate; mandatory feasible automated auth checks |

`docs/todo.md` and `docs/ui.md` are compatibility pointers, not alternate source-of-truth files. Older `docs/cicd-v2-*`, Cloud Build, migration reports and release receipts remain discoverable as dated historical records.

## Architecture boundaries

PostgreSQL/omni_chat owns live Owner/thread/turn/event/approval state. GCS artifacts and Iceberg/BigLake archival are unaccepted target design. Direct Groq adapter source exists but Chat end-to-end integration is open. BYOK management and Chat production model Dispatch are separate opt-in gates. Shared Gateway caller identity does not substitute for each consumer's end-user authorization.

**Completion** requires implementation → tests → CI → deployment → runtime/integration evidence. Manual Google OAuth sign-in acceptance is NOT_REQUIRED; valid automated OAuth/JWT/IAM/Owner authorization tests remain mandatory.

Additional feature contract: [AI Router 戰情室](../docs/ai-router-analytics.md), including source provenance, admin-only API, UI controls and release gates. Its existence in source does not establish deployed availability.
