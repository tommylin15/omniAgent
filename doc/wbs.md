# omniAgent Current WBS — 2026-10-14

Source of current status: [TODO](todo.md), [Acceptance](acceptance.md), and live GitHub/GCP evidence. This file defines scope, not a second historical progress timeline.

| Work package | State | Exit |
| --- | --- | --- |
| Gateway private Gemini production | PASS | Signed three-caller formal positive/negative tests |
| Three Cloud Run formal services / IAM | PASS | Independent serving Ready/100% IAM readback |
| Three services retain ten revisions | PASS (2026-10-14 snapshot) | Cleanup receipt and 10/10/10 readback |
| One-Owner Gemini Preview response and DB history | PASS (Preview only) | User-observed reply and durable terminal event |
| Production Chat Dispatch | OPEN / OFF | Owner entitlement, signed Gateway, real persisted reply |
| Two-Owner authorization/data isolation | PARTIAL | Legitimate two-Owner real positive/negative E2E |
| SSE/reconnect/cancel/approval/idempotency | PARTIAL | Fault-injection acceptance |
| Codex Owner-specific execution and persistence | PARTIAL | Owner isolation and terminal runtime evidence |
| Consumer business release (Life / market-mart) | PARTIAL | Consumer-owned production/schema/DB receipts |
| Flutter deployed mobile/desktop and long chat | PARTIAL | Browser/mobile functional and visual acceptance |
| OpenRouter and Groq complete Chat path | OPEN | Entitlement/provider/DB/UI production E2E |
| BYOK/Credential Resolver and MCP/Tools | PARTIAL | Secret lifecycle, scoped usage and tool isolation |
| GCS artifacts / Iceberg / BigLake | TARGET / OPEN | Separate funding/implementation/runtime |
| Full product release | PARTIAL | Every mandatory security, CI, deployment and integration gate |

Technical Gateway PASS is not full Chat product PASS. Human OAuth manual acceptance remains NOT_REQUIRED, while automatable identity/security checks remain mandatory. Risk mitigation: [2026-10-14 audit](../docs/project-risk-audit-2026-10-14.md).
