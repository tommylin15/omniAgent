# Migration from Janus — Phase 1 checkpoint

Copied: `services/agent-gateway` TypeScript runtime and Dockerfile, three gateway/provider tests, and `packages/contracts/assistant.v1.json` as a compatibility snapshot. New independent Node package, lockfile, TypeScript build, test command, and documentation live in this repo. Janus originals remain in place and live traffic is unchanged.

The Dockerfile no longer bundles Janus's `services/mcp-fixture`; its tests and real Janus integration remain Janus-owned. The copied gateway still uses Janus-specific environment variables, signing headers, service names, Secret/GCS assumptions, and context schema. Treat it as non-deployable compatibility code until Phase 2+ boundary work, auth/storage decisions, isolated runtime validation, and rollback evidence. No historical data, migration, Cloud Run service, Secret, IAM, or OAuth resource has moved.

Rollback for this checkpoint is simply to leave the existing Janus runtime untouched. Do not delete this copy to imply a live cutover or delete Janus originals before acceptance.
