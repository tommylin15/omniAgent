# omniAgent

Independent Agent runtime, Chat API/storage target, provider/worker orchestration layer, and Flutter Chat UI source.

omniAgent is the authoritative owner of its Chat/Gateway/UI source and current deployment documentation. Phase 6B remains partial: the recorded Gateway candidate and real Gemini/OpenRouter provider probes passed at their cited checkpoints, while durable Chat→Gateway dispatch, real Chat/UI deployment, multi-owner acceptance, Codex owner auth, storage cutover, and final acceptance remain open.

## Current architecture direction

omniAgent keeps operational state and long-term data as separate concerns:

- **PostgreSQL / `omni_chat`** — authoritative hot state for owners, threads, turns, events, approvals, Skills, idempotency, dispatch state, and replay cursors.
- **GCS** — target object/artifact layer for large message bodies, attachments, tool outputs, exports, and other payloads that should not inflate the hot relational path.
- **Iceberg on GCS** — target immutable historical/audit/analytics lakehouse for conversation events, worker/tool executions, provider usage, errors/retries, and long-term history.
- **BigLake/BigQuery integration** — target analytics/query layer over archived data; implementation and cost-impacting resources require separate approval.
- **Credential plane** — target BYOK + platform-provided credential model. Provider credentials are independent from owner memory; sharing a platform provider key never permits shared Chat memory or execution context.

The accepted design keeps Iceberg out of the runtime queue/state-machine path. PostgreSQL remains the source of truth for live turn transitions and owner-isolated replay. Historical archival is asynchronous.

Target provider set is Gemini, OpenRouter, Codex, and Groq. Current source contains Gemini/OpenRouter/Codex support; direct Groq support and the generalized Credential Resolver are planning targets, not implemented evidence.

Node: run `npm ci`, `npm run build`, and `npm test` here. Flutter: run `flutter pub get`, `flutter analyze lib test`, `flutter test`, and `flutter build web` from `apps/agent_app`. No credentials or real endpoint values are checked in.

**CI/CD target (2026-10-08, migration OPEN):** GitHub Actions full CI + public GHCR immutable digests → Cloud Run 0%-traffic candidate revisions → real acceptance / protected promotion / rollback. The new release process does not invoke Cloud Build or explicitly write Artifact Registry/GCS. [Policy](doc/spec.md#8-cicd--github-actions--public-ghcr--cloud-run-2026-10-08) · [runbook](docs/cicd-ghcr-actions-runbook.md).

See [current control documents](doc/README.md), [architecture](docs/architecture.md), [storage ownership/import gate](docs/chat-storage-migration.md), [active TODO](doc/todo.md), and [deployment runbook](docs/runbook-ui-cutover.md).
