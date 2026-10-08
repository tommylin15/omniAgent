# omniAgent CI/CD: GitHub Actions → public GHCR → Cloud Run

**Approved architecture, 2026-10-08. Status: TARGET-DESIGN / MIGRATION OPEN.** Policy owner: [SPEC §8](../doc/spec.md#8-cicd-v2); acceptance: [matrix](../doc/acceptance.md); backlog: [TODO](../doc/todo.md). This supersedes the legacy [Cloud Build V2 runbook](cicd-v2-runbook.md) for *new* releases, not its historical evidence.

## Control and trust flow

```
ChatGPT → GitHub(main) → GitHub Actions (full CI + Docker builds + GHCR)
  → GCP APIs (WIF → Cloud Run, digest-pinned 0%-traffic candidate)
  → live acceptance → approved promotion / rollback
  → GitHub Actions Logs / summaries → ChatGPT

Optional legacy diagnosis: Actions → WIF (read only) → existing Cloud Build
  → sanitized build status, step states, masked error summary → Actions Logs
```

Repository: `tommylin15/omniAgent`; GCP project:
`gen-lang-client-0593591102`; region: `us-central1`. The three existing
services are `omniagent-chat` (includes Flutter Web), `omniagent-agent-gateway`,
and `omniagent-shared-codex`. No new worker/Compute Engine service.

**Scope exclusion:** The new pipeline does **not** run Cloud Build/triggers,
explicitly push to Artifact Registry, or write CI/CD assets, logs, locks or
evidence to GCS. It does not introduce Compute Engine. Cloud Run's *managed*
image import/caching is not an explicit CI/CD write to Artifact Registry.
Do not delete legacy GCS/Artifact Registry assets **until** the GHCR
cutover has passed, real GCP dependencies have been inventoried, and the
[one-time retirement gate](legacy-gcs-ar-retirement.md) has approved
exact targets. That plan covers **AR Docker images, entire AR repositories,
GCS objects and buckets**, excludes shared/unknown/runtime resources and
is **not** a release job or the last-10-Cloud-Run-revision cleanup step.
Separately approved runtime **application** GCS/Iceberg data storage is not
changed by this CI/CD decision.

## Quality / GHCR build contract

A normal push to `main` must run all mandatory quality gates against the
*same* reviewed full commit SHA before publishing images:

- Node `npm ci && npm run build && npm test`, API/contract/security,
  Python safety suites, shell syntax/hygiene;
- disposable PostgreSQL 16 migration and owner-isolation acceptance;
- `apps/agent_app`: `flutter pub get`, `flutter analyze lib test`,
  `flutter test`, `flutter build web`;
- Dockerfile checks and proof that no raw credentials are embedded in public
  images, build args, contexts or output.

Publish the three images to `ghcr.io/tommylin15/omniagent-chat`,
`ghcr.io/tommylin15/omniagent-agent-gateway`, and
`ghcr.io/tommylin15/omniagent-shared-codex`. Record independent immutable
`sha256` digests, the exact source SHA and Actions run ID. **GHCR packages
must individually be Public** and verified anonymously retrievable; a public
source repo alone does not make its image packages public. Cloud Run officially
supports direct deployment of **public** GHCR images; private GHCR requires
Artifact Registry remote repositories and is therefore disallowed by this
architecture: https://cloud.google.com/run/docs/deploying

The existing `.github/workflows/omniagent-ghcr-publish.yml` has relevant
quality + publish code, but its current push path filter only matches that
workflow file. Do not treat normal main-source push CI as complete until the
trigger and observed Actions execution prove it. A Docker build is not a
deployed revision or production release.

## Deployment identity and candidate contract

GitHub Actions authenticates to GCP only through Workload Identity Federation
for the intended repository and `refs/heads/main`:
`projects/131494961796/locations/global/workloadIdentityPools/omniagent-github/providers/github`,
using `omniagent-ci@gen-lang-client-0593591102.iam.gserviceaccount.com`.
Check effective trust/permissions before claiming success. Limit run
deployment/update/read permissions to intended services and
`iam.serviceAccounts.actAs` to their *existing* runtime identities.
Never rely on project Editor/Owner or log Secret payloads.

Explicitly authorized release (`workflow_dispatch`) must verify exact
current-main SHA, previously passed full quality run, approved GHCR digest and
safe concurrency/stale-SHA/lock behavior. For each existing Cloud Run service,
preserve active traffic and the current runtime SA, OAuth, ingress, VPC,
database and Secret configuration, including existing `omniagent-bundle`
constraints. Create **0%-formal-traffic** candidate with a pinned digest:

```bash
# Illustrative only — run from approved Actions release after prerequisites.
gcloud run deploy "$SERVICE" \
  --project=gen-lang-client-0593591102 --region=us-central1 \
  --image="ghcr.io/tommylin15/$IMAGE@sha256:$DIGEST_HEX" \
  --no-traffic --quiet
```

Validate service-to-image map; `DIGEST_HEX` must be 64 lowercase hex chars
from that SHA's verified image receipt. Do not use `--source`, a mutable tag
or a new service. Read back the candidate revision, digest, 0%-traffic
allocation, service identity, Secret references, ingress, VPC and OAuth.
A restricted authenticated candidate tag may route **test** requests while
formal traffic stays at 0%; tag-only tests are not production rollback proof.

## Acceptance → traffic promotion → rollback

Mandatory real checks: Chat `/health=200`, DB-backed `/ready=200`,
Flutter UI, protected API, human two-owner OAuth/isolation, durable
Chat→Gateway dispatch and provider/approval/cancel/reconnect/replay, plus
Shared Codex three authorized identities, real outputs, fresh-thread
isolation and cross-project denials. Missing gates are BLOCKED, never
synthetic PASS. Component skips require tested dependency/contract rules.

Before promotion snapshot current **real traffic percentages** and revision
IDs. After *all* affected service acceptance and recovery drill PASS, apply
protected progressive/controlled traffic change and read back each revision
percentage. On partial failure, restore/read back the exact prior allocation
and preserve previously serving images. Stale SHA, simultaneous releases
or image-digest mismatch must fail closed. Image deletion remains disabled during migration; **Cloud Run Revision
retention** is separately permitted **only as the final post-promotion
step** after all acceptance, rollback and traffic readback pass.

### Automated Cloud Run Revision retention (keep 10 per service)

Owner setting: retain the **10 newest Cloud Run revisions per existing
service** (or all revisions when fewer than 10 exist). The deployed
100%-traffic revision **and the recorded last-known-good rollback target**
must both be included among the ten, even if failed candidates were created
between them. If the known-good rollback target falls outside the newest
ten, **BLOCK cleanup**, keep the existing revisions, and surface the
exception rather than destroying rollback ability. Some retained revisions
may be unaccepted candidates; ten is a history limit, not a promise of
ten validated rollback targets.

The reusable final-stage workflow is
`.github/workflows/omniagent-cloudrun-retain-ten.yml`; its checked deletion
planner/executor is `scripts/cloudrun_revision_retention.py`, with tests in
`tests/test_cloudrun_revision_retention.py`. The actual release workflow
must call this workflow **only after** candidate acceptance, real rollback
rehearsal, successful traffic promotion and runtime readback. Pass
`release_sha`, `acceptance_and_promotion_passed=true`, and the three
services' exact promoted + last-known-good rollback revision names.
GHCR image publication or a cron timer **must not** independently invoke
this destructive step.

The implementation first performs a **dry run**, then re-reads real service
and revision metadata before **each** deletion and after the last one.
The approved promoted revision must be latest-created, latest-ready and
hold 100% of formal service traffic. Never delete a tagged revision, a
traffic-serving revision, or any of the newest ten. Abort on unexpected
revision names/ages, missing access or metadata, split traffic, an
unready latest revision, a rollback target outside the ten, or concurrent
changes. If a tagged/serving old revision prevents exact-ten retention,
leave **more than ten** and log BLOCKED; never override safety.
No deletion takes place until the new deployment pipeline is fully
implemented and its gates have passed.

**Billing:** Cloud Run revisions receiving no requests normally scale
to zero, use no compute resources and incur no compute charge. This is
not universal: revision-level minimum instances, tagged revisions with
minimum instances, requests to tag URLs, instance-based billing and
startup/shutdown activity can have costs. Retention count alone does
not establish actual billing or storage invoices. See Google Cloud's
[revision management](https://cloud.google.com/run/docs/managing/revisions)
and [minimum instances](https://cloud.google.com/run/docs/configuring/min-instances).

**Rollback:** rollback to the recorded previously serving revision stays
available; older revisions among the ten might require separate integration
acceptance before promotion. Image retention is independent: this rule
never deletes any GHCR Docker image, GCS object or Artifact Registry asset.

**Integration status:** the new GHCR pipeline is not yet a fully accepted
Cloud Run release/promote workflow. The reusable cleanup hook is **not
connected to image publish**, and no real Cloud Run revision deletion
or end-to-end retention acceptance has been demonstrated.

## Actions Logs → ChatGPT; optional old Build read-only diagnosis

Actions must surface exact source SHA, package digest, gate PASS/FAIL/BLOCKED,
Cloud Run candidate/traffic readback and sanitized failure class in job
summaries/logs. ChatGPT reads these **GitHub Actions** logs through the
GitHub connector. This does not imply that ChatGPT has native unmediated GCP
access.

The optional existing `omniagent-cloudbuild-status-readonly.yml` may inspect
**one existing Cloud Build ID** via WIF and minimum build metadata read
permissions (for example `roles/cloudbuild.builds.viewer`), reporting
`SUCCESS`/`FAILURE` or the actual other state, failed step IDs, failure
class, and a bounded *masked* error summary. Deny build create/trigger,
Secret payload reads, GCS/Artifact Registry mutations and raw log dumps.
If Cloud Logging access is required for the summary, scope it separately,
test redaction and fail closed. Redact bearer tokens, authorization headers,
database URLs, keys, cookies, signed headers and untrusted text; unknown
content becomes `REDACTED`. **Current workflow reads build metadata/step
states but explicitly does not read raw logs or produce an error excerpt.**
The requested masked-error enhancement is still OPEN.

## Migration and evidence gates

1. [ ] Normal main commit → complete Actions tests and GHCR publish observed.
2. [ ] All three packages Public, anonymous pull and immutable digest receipts PASS.
3. [ ] WIF exact-claim/IAM verification and 0% Cloud Run candidates PASS.
4. [ ] Live Chat/Gateway/Shared acceptance and real rollback drill PASS.
5. [ ] Protected promotion and readback PASS, no unapproved traffic mutation.
6. [ ] Disable historical Cloud Build CI/release triggers only **after** replacement
   is proven; preserve historical logs/configuration as audit history.
7. [ ] Prove no new release invokes Cloud Build, writes to GCS/Artifact
   Registry, or provisions Compute Engine; record evidence links under
   [TODO](../doc/todo.md) and [acceptance](../doc/acceptance.md).

**Completion rule:** implementation → exact-SHA tests → Actions CI → GHCR
immutable artifact → Cloud Run candidate → real integration/rollback/traffic
evidence. A document commit or a green source test is **not DONE**.
