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
- The current preflight requires omniAgent-owned `OMNIAGENT_GCP_WIF_PROVIDER`, `OMNIAGENT_GCP_CI_SERVICE_ACCOUNT`, and `OMNIAGENT_ARTIFACT_REPOSITORY`.

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
