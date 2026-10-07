# omniAgent

Independent Agent runtime, Chat API/storage target, provider/worker orchestration layer, and Flutter Chat UI source.

Split Phases 0–5 are closed as migration checkpoints. That does **not** mean live cutover is complete. The last recorded Phase 6B evidence is partial: the private Gateway candidate and real Gemini/OpenRouter provider probes passed, while durable Chat→Gateway dispatch, real Chat/UI deployment, multi-owner acceptance, Codex owner auth, storage cutover, and final acceptance remain open.

## Current architecture direction

omniAgent keeps operational state and long-term data as separate concerns:

- **PostgreSQL / `omni_chat`** — authoritative hot state for owners, threads, turns, events, approvals, Skills, idempotency, dispatch state, and replay cursors.
- **GCS** — target object/artifact layer for large message bodies, attachments, tool outputs, exports, and other payloads that should not inflate the hot relational path.
- **Iceberg on GCS** — target immutable historical/audit/analytics lakehouse for conversation events, worker/tool executions, provider usage, errors/retries, and long-term history.
- **BigLake/BigQuery integration** — target analytics/query layer over archived data; implementation and cost-impacting resources require separate approval.
- **Credential plane** — target BYOK + platform-provided credential model. Provider credentials are independent from owner memory; sharing a platform provider key never permits shared Chat memory or execution context.

The accepted design keeps Iceberg out of the runtime queue/state-machine path. PostgreSQL remains the source of truth for live turn transitions and owner-isolated replay. Historical archival is asynchronous.

Target provider set is Gemini, OpenRouter, Codex, and Groq. Current source contains Gemini/OpenRouter/Codex support; direct Groq support and the generalized Credential Resolver are planning targets, not implemented evidence.

Janus remains an external domain system. omniAgent must not read Janus DB/GCS/Iceberg directly; Janus may only be consumed through approved bounded API/MCP contracts.

Node: run `npm ci`, `npm run build`, and `npm test` here. Flutter: run `flutter pub get`, `flutter analyze lib test`, `flutter test`, and `flutter build web` from `apps/agent_app`. No credentials or real endpoint values are checked in.

See [current control documents](doc/README.md), [architecture](docs/architecture.md), [storage/migration gate](docs/chat-storage-migration.md), [split execution status](docs/todo.md), [UI cutover runbook](docs/runbook-ui-cutover.md), and [Janus connector](docs/janus-connector.md).
