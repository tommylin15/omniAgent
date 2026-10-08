# Shared Codex runtime — integration and acceptance

Status (2026-10-08): Shared endpoint implementation/tests, private Cloud Run deployment and live signed inference for all three configured caller identities **PASS** (GitHub Actions run 37709954944, attempt 3). External consumer adapter cutovers and legacy credential Secret retirement remain separate outstanding work; do not claim these completed.

## Boundary

This is an omniAgent-owned **dedicated Cloud Run service**, not an extension of the existing Chat or Agent Gateway endpoints. It reuses the existing Codex App Server client, bridge, and Secret Manager credential handling, while exposing only a narrow, text-only request/response contract to approved application services.

```text
Consumer service A ── Google ID token ──┐
                                      ├─> omniagent-shared-codex (Cloud Run IAM)
Consumer service B ── Google ID token ──┘          │
                                               signed caller / project match
                                                   │
                                            fresh isolated CODEX_HOME
                                            fresh workspace, thread, process
                                                   │
                                            Codex App Server / read-only
                                                   │
                                        bounded JSON text response
```

User context is supplied by the calling service as a stable `ownerId`; no input ownerId grants access to existing omniAgent Chat threads. The Cloud Run service **does not** access consumer projects' databases or object stores, and does not load or reproduce their user memory. A platform credential can be shared as authorization only, not as a shared session or memory store.

## Endpoint

`POST /v1/codex/execute`

Request body (JSON, no extra properties):

```json
{
  "project": "consumer-a",
  "ownerId": "00000000-0000-4000-8000-000000000001",
  "requestId": "00000000-0000-4000-8000-000000000002",
  "prompt": "Summarize these explicitly provided facts.",
  "model": "optional-approved-model"
}
```

Only `model` is optional. The input is limited to 16 KiB UTF-8; output is limited to 32,000 characters. A fresh Codex App Server thread is created for each request, with a 120-second turn bound. In this initial phase, arbitrary shell commands, writable workspaces, MCP grants, repository operations, and hidden carry-over context are not exposed.

Success:

```json
{
  "status": "completed",
  "project": "consumer-a",
  "ownerId": "00000000-0000-4000-8000-000000000001",
  "requestId": "00000000-0000-4000-8000-000000000002",
  "result": { "text": "Model response." },
  "providerIds": { "threadId": "provider-thread", "turnId": "provider-turn" }
}
```

Failure statuses: 400 malformed request, 401 absent/invalid signed identity, 403 project/caller mismatch, 429 worker busy, 502 model/credential/transport failure. Cloud Run's own ingress IAM may return 403 before application code runs. The service does not return Secret values or raw internal exception messages.

Call using a signed Google ID token with `aud` equal to the service URL. The caller's service account must have `roles/run.invoker`, and the verified token email must match its configured `project` label. An ordinary API key or self-asserted project name is **not** sufficient.

## Required release configuration

Release workflow configuration is pinned in `.github/workflows/shared-codex-cloud-run.yml` to the dedicated Secret resource and three isolated caller service accounts. **Do not put Codex refresh/access tokens in GitHub repository variables, source or workflow logs.** The one-time migration and IAM binding requires a Google Cloud administrator identity; `omniagent-ci` intentionally does not have the project-wide Secret Manager or IAM admin rights needed to elevate itself.

Operator procedure in a Google Cloud Shell already authenticated as an authorized project administrator:

```bash
# This repository is private; authenticate GitHub access in Cloud Shell first.
# If GitHub CLI is available:
gh auth login --web
gh repo clone tommylin15/omniAgent
cd omniAgent
SOURCE_CODEX_AUTH_SECRET="<the-approved-existing-Codex-auth-Secret-name>" \
  bash infra/gcp/bootstrap-shared-codex-iam.sh
```

If GitHub CLI is unavailable, authenticate Git over HTTPS securely before cloning the private repository; do not place tokens in shell commands or history. The script independently verifies the exact project number, creates the dedicated Secret and four restricted service accounts, transfers the approved existing Codex `auth.json` using temporary mode-0600 files, validates a byte-identical Secret Manager readback, grants only destination-Secret runtime access and metadata-only CI viewer permission, configures scoped runtime-account attachment and token-minting for the three low-privilege caller accounts, and leaves the source Secret intact. It is safe to rerun without replacing an existing enabled destination Secret version. Review its code before executing it. The CI-only `Shared Codex IAM bootstrap verification` action validates bash and shellcheck; it **does not run this administrator operation**.

After this one-time action, rerun `Shared Codex Cloud Run candidate` through GitHub Actions; a new Cloud Run revision is not accepted until the private ingress, credential verification and all three real inference calls pass. The old credential Secret is a separate retirement action requiring verified service acceptance, and is never deleted by the IAM bootstrap.

The deploy workflow `.github/workflows/shared-codex-cloud-run.yml` uses omniAgent-owned GitHub WIF and Artifact Registry. It requires the previously provisioned `omniagent-shared-codex@...` and scoped Secret access, builds an immutable image, deploys `omniagent-shared-codex` in `us-central1` with `--no-allow-unauthenticated`, maximum one instance and concurrency one, and binds only the configured caller identities to `roles/run.invoker`.

The existing external-runtime auth Secret must not be renamed, deleted, silently re-pointed, or exposed. Migration to a dedicated Secret is a separate controlled copy/verification/cutover. Until the new Secret and caller identities exist, deployment must **fail closed**.

## Acceptance gate

1. Source build and tests for strict input, forged caller rejection, project mismatch, isolated invocation, and redacted errors.
2. GitHub workflow passes real GCP WIF authentication and preflight for the approved Secret and caller identities.
3. Dedicated runtime identity, image digest, private Cloud Run deployment, and exact IAM policy read back.
4. Anonymous call rejected; legitimate caller A and caller B can each call and receive a non-empty real Codex response; a caller cannot assert the other's project label.
5. Fresh owner/process/thread isolation, no shared memory, bounded timeouts, Secret refresh persistence, and no token/raw prompt in runtime logs.
6. Existing omniAgent Chat Gateway, external applications, and their active deploys remain unaffected.

A deployment-only PASS is not a real provider-inference PASS. Two external consumer projects must not be declared integrated until their live authenticated calls and response handling are tested individually.

## Verified GCP checkpoint — 2026-10-08

- Image publishing: workflow [37708000610](https://github.com/tommylin15/omniAgent/actions/runs/37708000610) **PASS**, immutable digest `sha256:55212af1496c3b0f284779f9c3f6a752f2eda1c469b7c2deec08fa52cd0cecbd`; the pinned CLI reports `0.153.4`.
- Dedicated Cloud Run deployment: **BLOCKED**, not live. Workflow [37707944086](https://github.com/tommylin15/omniAgent/actions/runs/37707944086) confirms `omniagent-ci` lacks `secretmanager.versions.get`. Resource-bootstrap workflow [37708023596](https://github.com/tommylin15/omniAgent/actions/runs/37708023596) confirms `omniagent-ci` also lacks `secretmanager.secrets.create`.
- The current release workflow pins the dedicated destination `projects/gen-lang-client-0593591102/secrets/omniagent-shared-codex-auth` and three **explicit** caller identities: `market-mart` -> `omniagent-codex-market-client@gen-lang-client-0593591102.iam.gserviceaccount.com`, `life-assistant` -> `omniagent-codex-life-client@gen-lang-client-0593591102.iam.gserviceaccount.com`, and `omniagent` -> `omniagent-codex-chat-client@gen-lang-client-0593591102.iam.gserviceaccount.com`. The external application consumer identity is a dedicated account, not the project-wide default compute identity.
- The account owner has approved retirement of the existing legacy credential Secret **after this shared service passes its own real provider and deployment verification**, without waiting for external consumer application code changes. This is not permission to delete it before the new auth has been securely transferred and verified. No deletion has taken place.
- One-time project-admin action is required because the repo's WIF identity lacks Secret Manager administration: run the audited `infra/gcp/bootstrap-shared-codex-iam.sh` as an approved project administrator to create the dedicated destination Secret, securely transfer the approved existing ChatGPT auth payload without printing it, and create the shared runtime and three dedicated consumer service accounts, give the shared runtime account `secretAccessor` and `secretVersionManager` on the **destination Secret only**, give the CI account read-only Secret **metadata** permissions on the destination, and grant the CI account `iam.serviceAccountUser` on the runtime account. Re-run the candidate workflow only after IAM readback; do not solve the blocker by granting project-wide Secret Manager admin to routine CI.
- External consumer code is not edited by this work package. Once the private service is verified, communicate the endpoint URL, Cloud Run audience, caller mapping, and JSON contract to those teams. Do not record an external application as integrated before its own tests pass.

The dedicated life and market caller accounts are **low privilege** and receive only permission to invoke the shared Cloud Run service; they must not inherit market-analysis database/storage permissions or the default compute account's broader privileges. When an existing consumer service needs to call, it may mint an audience-bound Google ID token by being granted scoped impersonation of its dedicated caller identity, or run under that identity if its other permissions allow it. The consumer adapters themselves belong to their own repositories, not this one.

**OpenID Connect ID-token tests:** the release workflow now requires one real Codex response for each of the three caller identities plus cross-project rejection. The release CI identity needs a temporary, narrowly scoped ability to mint ID tokens for the three dedicated/test caller accounts (for example a short-lived `roles/iam.serviceAccountTokenCreator` binding on each target service account), and those grants should be revoked after acceptance if no longer required. This step is not equivalent to consumer application E2E and does not assert those consumer apps are already migrated.

## Production acceptance evidence — 2026-10-08

- **GitHub Actions source and deployment gate:** [37709954944 attempt 3](https://github.com/tommylin15/omniAgent/actions/runs/37709954944) = **SUCCESS**, head SHA \`ff282575fb13163018827761b8bfee8e8789bcb3\`.
- **Cloud Run URL / Google ID-token audience:** \`https://omniagent-shared-codex-2oo7qbkd5q-uc.a.run.app\`, region \`us-central1\`, service \`omniagent-shared-codex\`, private Cloud Run ingress IAM.
- **Auth and deployment:** enabled dedicated Secret verified; runtime SA and service revision readback PASS; anonymous request returned 403 as expected.
- **Provider live inference:** \`life-assistant\`, \`market-mart\` and \`omniagent\` each returned HTTP 200, nonempty native Codex output and provider thread/turn IDs. CI logged only output SHA-256 digest, not payload. \`cross_project_rejection=PASS\` twice and \`all_configured_callers_live_inference=PASS\`.
- **Independent signed caller diagnostic:** [37710625658](https://github.com/tommylin15/omniAgent/actions/runs/37710625658) = PASS: Cloud Run invoker binding, minted ID token email/audience/email_verified and HTTP 200 Codex response. A prior first-attempt 403 did not reproduce after IAM propagated; do not classify that earlier failure as a provider outage.
- **Explicit boundaries:** This proves the **shared service itself** is callable using impersonated consumer identities. It does *not* prove any external application has changed its runtime code to use it. The consumer teams must separately implement and verify their own adapters. The original external auth Secret is **still present**, and its retirement remains a dedicated privileged operation after this evidence has been reviewed.
- **Caller identity contract:** \`life-assistant\` -> \`omniagent-codex-life-client@gen-lang-client-0593591102.iam.gserviceaccount.com\`; \`market-mart\` -> \`omniagent-codex-market-client@gen-lang-client-0593591102.iam.gserviceaccount.com\`; \`omniagent\` -> \`omniagent-codex-chat-client@gen-lang-client-0593591102.iam.gserviceaccount.com\`. Each caller must mint an ID token for the exact Cloud Run URL and use the corresponding \`project\` in the body.
- **No GitHub or consumer-source edits** outside the omniAgent repository occurred in this work package. This service exposes bounded read-only text operations, not arbitrary CLI shell or repository mutations.

## Approved credential retirement procedure (operator-only)

The owner separately authorized removing the previous external Codex auth Secret **after successful standalone shared-service acceptance**, even though the external consumer adapter may be migrated afterward. The service's own live acceptance is now PASS. The current connected GCP management capabilities cannot mutate Secret Manager allow policies or delete Secrets, so the final privileged deletion must run from authenticated Google Cloud Shell; do not misreport it as already done.

`infra/gcp/retire-legacy-codex-auth.sh` performs an independent **read-only preflight** against the successful GitHub Actions live run, pinned deployed image, dedicated runtime identity, enabled dedicated auth Secret, exact audience, all three Cloud Run invoker bindings and no public access; only then calls Secret Manager delete on the explicitly named legacy Secret. It does not modify consumer code. Since existing consumers may still reference the legacy Secret, their old execution path may fail until the independently owned adapter cutover; this interruption was accepted by the owner.

```bash
cd ~/omniAgent
git pull --ff-only origin main
LEGACY_CODEX_AUTH_SECRET="<approved-legacy-secret-name>" \
CONFIRM_LEGACY_CODEX_RETIREMENT=RETIRE_AFTER_LIVE_PASS \
  bash infra/gcp/retire-legacy-codex-auth.sh
```

The script finishes with `legacy_secret_retirement=PASS` only when the GCP delete command succeeds. The procedure intentionally uses the operator's existing administrator access; routine GitHub WIF CI continues to have no permission to delete unrelated Secrets. This legacy Secret retirement is not a precondition to giving separate teams the new private endpoint contract.

## Operational cautions

This initial synchronous endpoint is intended for bounded text tasks. Long-running code changes, GitHub write operations, interactive approvals, durable retry, async queues, idempotent replay, and model/provider usage accounting are **not implemented** by this slice. Repeated requests with the same requestId do not yet implement exactly-once semantics; consumer callers must avoid automatic unsafe retries. Scopes and entitlements must be reviewed before enabling more capable modes.
