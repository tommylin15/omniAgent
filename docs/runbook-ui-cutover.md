# omniAgent UI/runtime deployment runbook

This is the active cutover runbook for omniAgent. It does not depend on another project's deployment state.

## 1. Source gate

- pin one omniAgent commit SHA;
- Node build/tests PASS;
- Flutter analyze/tests/build PASS;
- confirm UI uses only omniAgent `/v1/threads` Chat routes.

## 2. GCP preflight

Run `.github/workflows/omniagent-dev-preflight.yml`.

Required repository variables:

- `OMNIAGENT_GCP_WIF_PROVIDER`
- `OMNIAGENT_GCP_CI_SERVICE_ACCOUNT`
- `OMNIAGENT_ARTIFACT_REPOSITORY`

The workflow must authenticate with an omniAgent-owned deployment identity and read the intended Cloud Run / Artifact Registry resources.

## 3. Runtime configuration

- Secret bundle: `omniagent-provider-bundle`.
- Gateway env: `OMNIAGENT_PROVIDER_BUNDLE`.
- Bundle key `mcp_owner_signing_key` supplies `MCP_OWNER_SIGNING_KEY`.
- Do not create or reference `omniagent-internal-signing-key`.
- Verify omniAgent OAuth client/origin.
- Verify Chat database, migrations and Chat runtime environment.

## 4. Candidate deployment

Build immutable images and record digests. Deploy/update candidate services without claiming production acceptance. Confirm:

- `/health` = 200;
- Flutter root loads;
- unauthenticated protected Chat routes reject access;
- Gateway remains private as designed;
- runtime service accounts are the approved omniAgent identities.

## 5. Live acceptance

Use real browser/mobile evidence for:

- Google login;
- two distinct owners and cross-owner rejection;
- create thread, send, queue, dispatch, event replay;
- Gemini/OpenRouter and any other enabled provider through Chat;
- approval binding and expiry;
- queued cancellation;
- reconnect/cursor behavior;
- Tools/Skills/Data Sources truthful unavailable/available states;
- responsive layout, long chat, code, keyboard/composer.

## 6. Promotion and rollback

Promote only after all mandatory gates PASS. Rollback must point to a known-good omniAgent image/revision and preserve omniAgent database consistency. Do not use another project's revision or image as the omniAgent rollback target.

## 7. External integrations

External systems remain bounded integrations only. Their internal deployment/runbook is outside this runbook and must not be consulted to infer omniAgent current state.
