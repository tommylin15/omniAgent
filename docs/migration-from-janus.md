# Migration from Janus — Chat ownership checkpoint

Phase 1 copied the Gateway and three provider/bridge tests. Phase 2 replaces this repo's mixed `assistant.v1.json` compatibility snapshot with `agent.v1.json` for generic contracts and tests generic security checks in `agent_security.ts`. Janus retains the original mixed compatibility schema, all live routes, its context wire, and the unchanged domain deny set. No code or live traffic is cut over.

The Dockerfile does not bundle Janus's `services/mcp-fixture`; its tests and real Janus integration remain Janus-owned. The copied gateway still uses Janus-specific environment variables, signing headers, service names, and Secret/GCS assumptions. Treat it as non-deployable compatibility code until authenticated real integration, auth/storage decisions, runtime validation, and rollback evidence. No historical data, migration, Cloud Run service, Secret, IAM, or OAuth resource has moved.

Rollback for this checkpoint is simply to leave the existing Janus runtime untouched. Do not delete this copy to imply a live cutover or delete Janus originals before acceptance.

The new omniAgent Chat API and `omni_chat` migration are an isolated ownership target; they are not deployed or live. Janus still owns all existing chat writes and history. The verified owner mapping, export/copy/compare procedure, runtime dispatch integration, and cutover gate are recorded in [chat-storage-migration.md](chat-storage-migration.md). Janus migration history remains in Janus.
