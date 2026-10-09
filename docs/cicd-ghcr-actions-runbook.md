# omniAgent CI/CD: GitHub Actions → public GHCR → Cloud Run

**Approved architecture, 2026-10-08. Status: GATE #1 AUTOMATIC CHAIN PASS; FORMAL RELEASE/PRODUCT INTEGRATION OPEN.** Policy owner: [SPEC §8](../doc/spec.md#8-cicd-v2); acceptance: [matrix](../doc/acceptance.md); backlog: [TODO](../doc/todo.md). This supersedes the legacy [Cloud Build V2 runbook](cicd-v2-runbook.md) for *new* releases, not its historical evidence.

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

The `.github/workflows/omniagent-ghcr-publish.yml` triggers on
ordinary `main` source changes. Verified 2026-10-09 fully automatic
chain for code SHA `c7f32b23d4ac4b60d43b3108e69e5b4019e31321`:
[CI + 3 public immutable GHCR #37894051418](https://github.com/tommylin15/omniAgent/actions/runs/37894051418)
→ [3 real 0% Cloud Run candidates #37894312427](https://github.com/tommylin15/omniAgent/actions/runs/37894312427)
→ [automatically triggered signed live Smoke #37894440766](https://github.com/tommylin15/omniAgent/actions/runs/37894440766),
all **SUCCESS**, original serving traffic preserved. Gate #1 PASS
is not a production promotion, live owner/browser/provider acceptance,
Shared real inference or tested rollback.
[Transition runtime evidence](cicd-transition-runtime-evidence.md)
describes earlier historical checkpoints.

## Deployment identity and candidate contract

GitHub Actions authenticates to GCP only through Workload Identity Federation
for the intended repository and `refs/heads/main`:
`projects/131494961796/locations/global/workloadIdentityPools/omniagent-github/providers/github`,
using `omniagent-ci@gen-lang-client-0593591102.iam.gserviceaccount.com`.
Check effective trust/permissions before claiming success. Limit run
deployment/update/read permissions to intended services and
`iam.serviceAccounts.actAs` to their *existing* runtime identities.
Never rely on project Editor/Owner or log Secret payloads.

The **candidate-only** workflow
`.github/workflows/omniagent-ghcr-cloudrun-candidate.yml` listens to a
successful matching GHCR publication (`workflow_run`, same own repository
and main SHA); it verifies exact current main, independently confirms all
three published SHA tags are anonymously readable as public GHCR digests,
and only then uses WIF to request **0%-traffic** revisions. It must
read back formal traffic, immutable image digests and protected runtime
configuration. An explicit, separately accepted formal release/promotion
still requires all live gates and safe concurrency/stale-SHA/lock behavior. For each existing Cloud Run service,
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

### Nonzero CLI but successful new Ready Revision

The 2026-10-09 Gateway candidate had a historical FAILED, tagged revision
`omniagent-agent-gateway-00021-boq` that still references destroyed Secret
`omniagent-bundle:2`. Cloud Run's CLI returned nonzero referring to this
*previous* revision even when the new Gateway revision had been created,
became Ready, had the approved `omniagent-bundle:latest` setting and
received zero formal traffic.

The new candidate workflow logs the CLI exit code; it **must NOT**
convert a nonzero CLI result into success without independently proving
all of: a newly created **and Ready** revision different from before,
the exact approved public GHCR image digest in the service template,
correct new revision tag, unchanged formal serving allocation,
approved Secret and unchanged protected runtime identity/VPC/ingress.
The downstream read-only signed smoke must also pass. Do not remove
historical tags/revisions or authorize formal promotion as a workaround.
The anomaly is tracked separately for future safe revision retention.

### Current Chat integration evidence (2026-10-09)

The newest GHCR source `6ab64229738bb75490231aed93e0d0d759c3aa4b`
passed [CI+3 GHCR #37903996197](https://github.com/tommylin15/omniAgent/actions/runs/37903996197),
[zero-traffic candidate deployment #37904503766](https://github.com/tommylin15/omniAgent/actions/runs/37904503766)
and [auto signed Smoke #37904670566](https://github.com/tommylin15/omniAgent/actions/runs/37904670566).
The service revisions are Chat `00036-pev`, Gateway `00027-suw`,
Shared `00016-jaz`. Previous GHCR-only SHA `c6020ed87fcf4b696f5816e23a34ba7b18350ebb`
is the currently verified *fallback set*. Its and the new release's
readiness, digests, tags and Secret metadata passed
[read-only rollback preflight #37904836739](https://github.com/tommylin15/omniAgent/actions/runs/37904836739);
new Shared real three-caller inference passed
[#37904946565](https://github.com/tommylin15/omniAgent/actions/runs/37904946565).

An independent **read-only** authenticated Chat/Gateway configuration
inventory is provided by
`.github/workflows/omniagent-ghcr-chat-integration-readonly.yml`.
Observed [run #37903833063](https://github.com/tommylin15/omniAgent/actions/runs/37903833063)
proved browser Google OAuth client and Chat internal service
authentication configuration PRESENT; **the dispatcher is currently
disabled**, the approved dispatch owner list is **empty**, and
`CHAT_GATEWAY_URL` / `CHAT_GATEWAY_AUDIENCE` are not configured to
the current zero-traffic Gateway candidate URL/service audience.
This is a **real live configuration blocker**, not a CI smoke failure.
The workflow does not print Secret values, call providers, read Secret
payloads, change Cloud Run traffic or mutate Chat/PostgreSQL data.
Never invent owner identifiers, enable billable provider execution,
or label browser OAuth PASS from GCP service-account token checks.

The Chat dispatcher also rejects Gateway events that claim a different
owner than the owner-bound PostgreSQL dispatch claim, including events
using Codex-native thread IDs. This safety regression was tested in
the exact-source CI. Existing provider message/event persistence
tests are not substitutes for real human owner/browser and Gateway
integration acceptance. After explicit owner entitlement/config approval,
test only zero-traffic candidates with bounded paid provider calls,
then verify actual database event persistence and cross-owner denial.
Formal release/rollback remain CLOSED until those checks actually PASS.

### 2026-10-09 post-promotion latest-ten cleanup: concrete GCP evidence

The new immutable-GHCR-only pipeline's read-only revision inventory is
`.github/workflows/omniagent-ghcr-revision-retention-inventory.yml`.
Real [inventory #37914559743](https://github.com/tommylin15/omniAgent/actions/runs/37914559743)
and [last-ten-tag refinement #37914953148](https://github.com/tommylin15/omniAgent/actions/runs/37914953148)
passed. Chat has 25, Gateway 21, and Shared 16 Revisions, for **32**
above the desired ten-per-service retention limit. A total of **22**
tagged outside-ten Revision references (11 Chat, 9 Gateway, 2 Shared)
prevent the current strict retention policy from deleting the older
Revisions. These tags are HTTP-addressable endpoints even with 0%
formal service allocation. All three existing 100%-serving old
Revisions are also outside the latest-ten window; these must stay
available **while they still serve traffic**. The verified primary
SHA `6ab642297...` and previous new-GHCR fallback SHA
`c6020ed87...` are both inside each service's latest ten.

Cloud Run's `gcloud run services update-traffic --remove-tags` can
remove only explicitly named unneeded tag routes without changing
the percentages. **That does not mean old tagged URLs are unused:**
verify no accepted clients or integration tasks still rely on those
individual endpoints; preserve the approved primary and GHCR rollback
candidate tags. After actual authorized GHCR promotion, confirmed
100% readback, actual GHCR-to-GHCR rollback rehearsal and recovery,
inventory again, retire only audited unneeded tags, reverify unchanged
active 100% allocation, then call the existing gated
`omniagent-cloudrun-retain-ten.yml` deletion stage. Its
`select_plan` must fail closed if active old traffic or any older
tagged candidate remains. Do not force cleanup via legacy rollback or
delete currently serving Revisions. A read-only inventory is not
permission to skip actual browser/dispatch acceptance or delete data.

## 2026-10-09 earlier owner-approved NEW-only rollback policy

**Approved:** New releases may promote and recover **only** among digest-pinned
public GHCR candidates of this same GitHub Actions → Cloud Run pipeline.
An old Artifact Registry image, Cloud Build trigger, or historical serving
Revision is *not* a mandatory rollback/release prerequisite. The currently
serving revision remains an audit/traffic observation, not the designated
new-release rollback target.

**Real readiness evidence:** New primary SHA
`c6020ed87fcf4b696f5816e23a34ba7b18350ebb` passed
[CI + 3 GHCR #37896498492](https://github.com/tommylin15/omniAgent/actions/runs/37896498492),
[3 zero-traffic candidates #37896743989](https://github.com/tommylin15/omniAgent/actions/runs/37896743989),
and [automatic signed Smoke #37896904915](https://github.com/tommylin15/omniAgent/actions/runs/37896904915).
Proposed fallback SHA `c7f32b23d4ac4b60d43b3108e69e5b4019e31321`
also passed an entire CI/candidate/smoke chain. Read-only
[GHCR-only rollback preflight #37897007278](https://github.com/tommylin15/omniAgent/actions/runs/37897007278)
**PASS**: current/fallback candidates for Chat, Gateway and Shared are
Ready, correctly tagged, digest-matched and have only enabled Secret
references. **This is not a formal traffic rollback drill.**

An older GHCR fallback SHA `e3475d3a...` was explicitly **BLOCKED**
by [preflight #37896367974](https://github.com/tommylin15/omniAgent/actions/runs/37896367974):
its Gateway Revision still referenced a destroyed Secret version. A
GHCR tag or historical Ready flag without current viable runtime Secret
dependencies is insufficient.

**Promotion requirement remains unchanged:** verified live human two-owner
browser OAuth, persisted provider/dispatcher paths, real Shared calls,
application authorization and cross-owner isolation must pass before
traffic mutation. Once accepted, snapshot formal traffic for audit,
require a full three-service new-GHCR fallback set, promote with bounded
readback and on partial failure recover to the validated new-GHCR fallback.
Rehearse actual current-GHCR ↔ previous-GHCR traffic changes and recovery
before claiming rollback PASS. A documentation change, preflight or tag-only
test is **not** a completed rollout. Never use old legacy rollback as a
hidden fallback, and never infer permission to bypass application gates.

## Acceptance → traffic promotion → rollback

Mandatory real checks: Chat `/health=200`, DB-backed `/ready=200`,
Flutter UI, protected API, human two-owner OAuth/isolation, durable
Chat→Gateway dispatch and provider/approval/cancel/reconnect/replay, plus
Shared Codex three authorized identities, real outputs, fresh-thread
isolation and cross-project denials. Missing gates are BLOCKED, never
synthetic PASS. Component skips require tested dependency/contract rules.

Before promotion snapshot current **real traffic percentages** and revision
IDs as audit evidence, plus exact validated primary and prior GHCR rollback
Revisions. After *all* affected service acceptance and the GHCR-only recovery
drill PASS, apply progressive/controlled traffic change and read back each
Revision percentage. On partial failure, move to the **approved new-GHCR**
fallback and verify its final allocation; do not require the old AR serving
Revision as the rollback source. Stale SHA, simultaneous releases or
image-digest mismatch must fail closed. Image deletion remains disabled during migration; **Cloud Run Revision
retention** is separately permitted **only as the final post-promotion
step** after all acceptance, rollback and traffic readback pass.

### Automated Cloud Run Revision retention (keep 10 per service)

Owner setting: retain the **10 newest Cloud Run revisions per existing
service** (or all revisions when fewer than 10 exist). The deployed
100%-traffic revision **and the recorded last-known-good **GHCR-only** rollback target**
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

**Rollback:** use only the previously accepted **new GHCR candidate**
as the protected recovery target; do not require any old Artifact Registry
serving Revision to remain a rollback prerequisite. A candidate’s Ready
metadata and a tag alone are not sufficient: it must have a currently valid
runtime configuration, passed candidate Smoke and real app acceptance.
Never delete an actively serving or live-tagged revision as a shortcut. Image retention is independent: this rule
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
