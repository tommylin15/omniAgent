# Phase 6B — omniAgent dev evidence

Status: **PARTIAL**. This file records only omniAgent evidence. Historical cross-project facts are not a current-state source.

## Proven checkpoints

| Area | Evidence |
| --- | --- |
| Gateway image | Cloud Build `30af8a13-fb5b-437f-8037-0a36279847c5` succeeded for `omniagent-agent-gateway@sha256:8278561a8ba5eaeaa3e209a151699391044530646d1498396724b00516afc773`. |
| Gateway candidate | Recorded private Cloud Run revision `omniagent-agent-gateway-00001-wav`, runtime SA `omniagent-gateway@gen-lang-client-0593591102.iam.gserviceaccount.com`. Re-read live state before relying on it. |
| Provider probe | Cloud Build `aba675c4-71f9-47e5-a547-33c7f2ddac52` succeeded for real OpenRouter and Gemini dispatch at that checkpoint. |
| Chat/UI image | Cloud Build `f28d1f52-fc88-42e7-9269-590ae379b9e5` succeeded for `omniagent-chat@sha256:ceda5c1cac842758018433f7e2de1b74c46cd23b76bd4159f3c170b8f70747b5`. A built image is not proof of a current Cloud Run deployment. |
| UI v1 Slice 1 | Implementation `d0974f03d79aa959c1164dbcd35657784d2119b4`; Flutter run `37624738722` PASS. |
| UI v1 Slice 2 | Implementation `3e84083bed8992b5f67bb32504956320fca05a18`; presentation fix `12a94018debd11f5b389aa2fdf325339782bb9d8`; Flutter run `37625912746` PASS. |

## Credential correction — 2026-10-07

The active omniAgent contract is:

- Secret: `omniagent-provider-bundle`.
- Bundle keys expected by Gateway: `gemini_api_key`, `openrouter_api_key`, `mcp_owner_signing_key`.
- `mcp_owner_signing_key` becomes runtime `MCP_OWNER_SIGNING_KEY`.
- Gateway bundle env: `OMNIAGENT_PROVIDER_BUNDLE`.
- Internal request headers: `X-OmniAgent-Timestamp`, `X-OmniAgent-Signature`.

The older evidence statement naming `omniagent-internal-signing-key` is invalidated. That Secret does not exist and must not be recreated.

## GitHub → GCP evidence

- Run `37627162243`: failed closed because omniAgent deployment variables were absent.
- Run `37627662825`: a temporary cross-project CI identity probe was rejected by the WIF attribute condition. That experiment is superseded and the cross-project identity has been removed from the workflow.
- The current preflight uses tracked omniAgent-owned identifiers: WIF provider `projects/131494961796/locations/global/workloadIdentityPools/omniagent-github/providers/github`, CI service account `omniagent-ci@gen-lang-client-0593591102.iam.gserviceaccount.com`, and Artifact Registry repository `omniagent`.
- GCP bootstrap/reconciliation is defined by `infra/gcp/bootstrap-omniagent-ci.sh`. This source definition is not runtime proof that the resources exist or IAM bindings are effective.
- Repo-side bootstrap commit `aabd96f879b84a984e54e9987ff28546fad99687`: Project Hygiene run `37633716460` PASS, including bootstrap shell syntax validation.
- Preflight run `37633716553` reached `google-github-actions/auth@v2` with the tracked omniAgent identifiers and failed with Google STS `invalid_target`: the dedicated `omniagent-github/providers/github` WIF target does not yet exist, is disabled, or has not been bootstrapped. Setup-gcloud/resource readback did not run.

## Still open

- live readback of current Cloud Run revisions and Artifact Registry;
- omniAgent WIF/CI identity configuration;
- independent Chat DB/role plus migrations;
- Chat/UI Cloud Run candidate deployment;
- real browser OAuth and two-owner isolation;
- durable Chat → Gateway dispatch;
- credential resolver/BYOK lifecycle;
- real Chat E2E for enabled providers;
- approval/cancel/reconnect/MCP E2E;
- production Twin Beast asset and deployed responsive visual acceptance.

No open item may be upgraded to PASS without new runtime evidence.


## External integration layer removal — 2026-10-07

The dedicated project-specific external-domain adapter has been removed from the current omniAgent baseline.

- Removed the dedicated external context client source, its tests, connector document and historical migration note.
- Renamed remaining Gateway/MCP/Codex fixture identities to omniAgent-owned names.
- Flutter Data Source copy now describes only generic omniAgent Tool/MCP/Data Source contracts.
- Removed the legacy external-user mapping fields from the not-yet-live Chat migration baseline.
- `setup-omniagent-db-dev.sh` no longer assumes another project's PostgreSQL container; `OMNIAGENT_POSTGRES_CONTAINER` is required and fails closed when absent.
- OmniAgentGPT Drive no longer contains the obsolete project-specific Worker Gateway architecture file.
- Repository hygiene CI rejects reintroduction of the removed project-specific integration in filenames or tracked content.

Validation evidence:
- intermediate Node Core run `37631303323` failed after the connector source was deleted while its test still existed; this was a real transitional failure, not a runtime/provider failure;
- run `37631308817` passed after the dangling test was removed;
- Node Core run `37632241702` PASS with migration/DB setup validation;
- Flutter run `37631522509` PASS after generic Data Source copy;
- Project Hygiene run `37632267393` PASS on `main@d3c4af7081919aab015a93cfef31dfee4839947c`.

This removal does not mean generic Tool/MCP/Data Source capability is complete. It means no dedicated external-domain adapter is part of the current source baseline.
