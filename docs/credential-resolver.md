# FR-013 Credential Resolver / BYOK staging contract (2026-10-10)

**Status: SOURCE IMPLEMENTED ONLY; BYOK MANAGEMENT OFF; MODEL EXECUTION OFF.
Not a fully accepted Credential Resolver or live BYOK deployment.**

## Invariants
- Authenticated Google subject maps to a server-derived UUID; clients cannot
  choose ownerId, a Secret Manager resource name, or a Secret version.
- The only browser-supplied raw key input is the authenticated POST
  /v1/credentials body (provider gemini/openrouter + apiKey).
  All error responses are generic; no browser API returns the raw key or the
  internal Secret Manager version locator. Responses are no-store.
- Stored PostgreSQL rows contain only owner UUID, profile UUID, provider,
  server-generated Secret Manager version locator, lifecycle status and time.
  Migration `infra/postgres/migrations/003_credential_metadata.sql`
  is additive/idempotent; it neither stores a key nor touches other schemas.
- Secret names are randomly generated and version-pinned to version 1 under
  the designated project. API uses application identity and official Google
  Secret Manager v1 calls. It never accepts arbitrary resource addresses.
- A reservation is durably PENDING before Secret Manager provisioning.
  The record is ACTIVE only after successful vault creation and DB update.
  A crash or uncertain write leaves PENDING (not usable); a separate
  operator reconciliation process must review it before cleanup/retry.
- Revoke marks REVOKING in PostgreSQL **before** disabling the Secret version,
  denying future resolver use. An uncertain disable leaves REVOKING,
  never ACTIVE; manual reconciliation is required for repeated errors.
- Public GET /v1/credentials returns only scoped profile/provider/status/date.
  DELETE is scoped to the verified owner; cross-owner lookups fail closed.
- Current internal `CredentialRegistry.resolveRef(owner,provider,profileId)`
  requires ACTIVE status and binds all three fields. It returns an internal,
  version-pinned *reference*, not the raw key.

## Feature toggle and deployment preflight
- `CHAT_BYOK_MANAGEMENT_ENABLED` defaults OFF. When OFF the new endpoints
  return 404, without DB migration or external Secret Manager API calls.
- Enabling requires first applying migration 003, setting
  `CHAT_BYOK_SECRET_PROJECT` to the *approved* project, granting the Chat
  service account narrowly scoped Secret Manager create/add-version/disable
  permissions for its managed namespace and checking IAM/retention/cost.
  No such flag, role, API, Secret, project or credential is configured
  as part of these source changes.
- BYOK **is not yet passed into Chat-to-Gateway execution**: the existing
  strict platform-model entitlement gate remains independent and still
  requires human approval. Codex BYOK is excluded; no user Codex session,
  token, raw key or billing gate is enabled.
- Do not treat an ACTIVE metadata row as permission to invoke a provider.
  Future phase: audited Gateway owner-bound resolver + non-secret audit
  attribution + credential rotation/disable idempotence and pending row
  reconciliation + real Owner A/B integration and authorized inference.

## Evidence requirements
Test fixtures cover owner isolation, disabled-by-default HTTP, write-before-
vault reservation, generic errors, no raw key projection, revoke denial,
PostgreSQL metadata-only migration and resolve-by-owner/profile/provider.
Use exact-SHA Node and disposable PostgreSQL tests, GHCR/Cloud Run 0%-traffic
candidate and signed smoke, followed by human-approved real BYOK/rotation
tests before changing any production execution configuration.
