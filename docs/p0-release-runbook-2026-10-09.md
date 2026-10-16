# P0 release evidence and protected promotion

The batch is not accepted until real owner/provider/MCP and fixed-preview two-account checks pass. Local fixtures and CI compilation do not prove those gates.

## Acceptance artifact

The successful current-main acceptance Actions run must upload `p0-acceptance` with `manifest.json` and `acceptance.json`. Never create a PASS artifact from unperformed work.

- Manifest: `source_sha`, and exactly three `services`: omniagent-chat, omniagent-agent-gateway, omniagent-shared-codex. Each service contains `primary` and `fallback`, each with `sha`, immutable `digest` and exact `revision`.
- Primary must match the accepted source SHA and the actual candidate revision. Fallback must be the currently serving verified GHCR revision at 100%.
- Acceptance: matching `source_sha`, `services` containing the exact primary version objects, and `gates`: ci, provider_reply, durable_replay, approval_cancel, mcp, process_loss, browser_a_b_a, preview_recovery. Each gate contains `status: PASS` and the real supporting own-repository Actions `run_url`.
- Supporting runs must succeed at the same source SHA. Review their runtime artifacts; a run conclusion alone does not prove provider or human behavior.
- Configure the `production` GitHub environment with release reviewers before enabling the release entry point. The workflow uses that environment; the environment protection itself is an operator configuration and remains unverified locally.

Run `omniAgent protected GHCR release and rollback` with that acceptance run ID. It checks provenance and the current remote main, acquires the shared deployment concurrency group, validates GHCR revision/digest/readiness and pinned enabled Secret versions, and probes both versions before touching traffic.

The sequence is primary → GHCR fallback → primary for Gateway, Shared and Chat. Each step reads back exact 100% traffic and checks health/IAM boundaries. A failed update is treated as potentially mutated. Recovery returns attempted services to the approved fallback only while routing/config still matches this operation. Concurrent drift is BLOCKED, and failed restoration is FAIL. Neither is reported as a successful release. Evidence is sanitized and uploaded even when preflight fails.

## Native process boundary

Chat saves owner/thread/turn/native IDs and replay cursor in PostgreSQL. Native handles remain bound to a Gateway process. A lost handle or expired in-flight operation becomes `runtime_outcome_uncertain`, with no automatic repeated inference. Multi-instance routing and native process survival must pass real acceptance; PostgreSQL persistence alone does not restore a native process. Completed native sandboxes are cleaned up by the existing Gateway, so this change does not promise cross-turn native resume.

## Bounded MCP configuration

When enabling dispatch, `CHAT_DISPATCH_MODEL_GRANTS` must be a nonempty JSON array of `{ownerId, runtime, model}` for approved owner UUIDs. Both HTTP enqueue and durable worker execution check the exact combination. Owner allowlisting alone does not authorize every provider/model.

`CHAT_MCP_GRANTS` is a server-owned JSON map of owner UUID → server ID → `{configRef, tools}`. Tools must be a nonempty list of namespaced names, for example `server__tool`. Gateway `MCP_SERVER_CONFIGS` resolves the approved config reference; client requests cannot provide URLs, credentials, config refs, owners or grants. Owner-authenticated POST routes are `/v1/mcp/:server/{discover,call,cancel,disconnect}`. Calls supply requestId, toolName and arguments only. Live configuration and real endpoint acceptance remain pending.

## Current open inputs

Two real owner UUIDs and exact provider/model approvals; existing owned Codex Secret refs and accessor permission; bounded Gemini/Codex calls; approved MCP endpoint/auth/tool contract; operator A-B-A login on the fixed preview. Do not paste passwords, tokens or API keys into chat.
