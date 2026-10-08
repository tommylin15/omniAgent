# Legacy GCS + Artifact Registry retirement gate (omniAgent)

**Decision recorded 2026-10-08 — planning only; deletion NOT AUTHORIZED BY EVIDENCE.**
Applies only to resources verified as exclusively owned by **omniAgent** in
GCP project `gen-lang-client-0593591102`, not to other project assets even
if hosted under that project. The repository `tommylin15/omniAgent`
and Cloud Run/runtime evidence are the sources of truth for current state.
[New CI/CD policy](../doc/spec.md#8-cicd--github-actions--public-ghcr--cloud-run-2026-10-08)
and [release runbook](cicd-ghcr-actions-runbook.md) take precedence over
historical Cloud Build V2 plans.

## Requested eventual cleanup scope

| Asset class | Action after verified cutover | Nonnegotiable exclusion |
| --- | --- | --- |
| Legacy **Artifact Registry Docker images**, tags, digests and unreferenced layers | Retire unneeded images **after** independent source SHA/digest and rollback copies in public GHCR are proven | Any still-used image, image required for a surviving Cloud Run Job/Execution/revision, shared repository image or historical recovery dependency |
| Entire **Artifact Registry repository** | Delete only when its full inventory is exclusively omniAgent, no surviving dependencies exist and all packages to retain were verified elsewhere | Shared registry; private remote repository still needed for a nonpublic GHCR path; unknown repository ownership |
| Legacy **Cloud Build GCS source staging, release locks, CI-only journal and temporary evidence** | Purge obsolete CI-only objects/buckets after legacy triggers disabled and audit records needed for accountability exported/retained elsewhere | PostgreSQL backups, business/user data, application artifacts, shared system buckets, Cloud Logging, required compliance evidence |
| GCS bucket itself | Delete only if empty by approved policy, uniquely owned by deprecated pipeline and after checking retention/hold/lifecycle policies | Any application runtime GCS/Iceberg lakehouse target, active shared bucket, unverified origin |

The **Cloud Run last-10-revision retention policy is distinct** from
AR/GCS retirement: deleting a Cloud Run revision does **not** delete the
original registry image; retaining a Cloud Run revision does not prove
its original AR image may be removed. Public GHCR digests should be kept
according to a separately accepted image retention policy.

## Mandatory read-only inventory (record an evidence manifest)

1. Enumerate **all regions** with AR repositories, Docker images, tags,
   digests, type (standard/remote/virtual), owner, exact size, last changes,
   IAM, and any cleanup policy; compare against GitHub workflow/image paths.
   Do not assume the recorded legacy `omniagent` repository is the only
   one, nor assume it still exists.
2. Enumerate GCS buckets/locations, object sizes and prefixes, owners,
   retention policies, soft-delete/object-hold/lock settings, and latest
   reads/writes/audit events. Classify **CI-only vs application data vs
   shared vs backup vs unknown**. Record unknown as BLOCKED, never DELETE.
3. Inventory every existing Cloud Run **service, revision, tag, traffic
   split, Job and Execution** (across applicable regions), plus other
   workloads/pipelines referring to `*.pkg.dev` image digests and GCS URIs.
   Check startup/restoration and documented rollback plans, not just the
   latest traffic-serving revision.
4. List historical Cloud Build triggers/configurations and ascertain
   effective state **from GCP**, not old docs. Disable the superseded push
   and release triggers **only after** the replacement Actions release is
   accepted, and verify no other build/diagnostic workflow still writes
   legacy assets.
5. For each proposed removal, record exact resource identifier, owner,
   size, hashes/digests as applicable, last use, consuming reference,
   replacement GHCR digest or retained backup, keep/delete decision,
   expected impact, and an approval/evidence link. Never infer unknown
   resource names from historical documentation.

Do not print secret values, object payloads, private backup contents,
signed URLs, tokens, database connection strings, provider keys, or
unredacted GCP diagnostics to **public GitHub Actions logs**. If an
authenticated read-only Actions workflow is used, emit only minimal
sanitized status; detailed private inventory remains in the permitted
administrator-controlled environment, not in a public GitHub artifact.

## Preconditions to enable deletion

- [ ] Exact `main` SHA passed complete GitHub Actions tests, GHCR
  publication and each package's public anonymous pull by immutable digest.
- [ ] All three existing services were deployed from intended public
  GHCR digest, 0%-traffic candidate accepted, protected traffic cutover
  and real rollback/readback succeeded.
- [ ] Previous known-good image digest and 10-revision rollback policy
  are retained, with no AR-only recovery reference.
- [ ] Old Cloud Build triggers demonstrably disabled; no expected GCS/AR
  write paths remain from GitHub Actions, Cloud Build, manual scripts
  or infrastructure automation.
- [ ] All live GCS buckets, AR repositories/images, consumers, Cloud Run
  services/revisions/jobs/executions and recoverability references have
  been inventoried and classified. Shared/unknown resources excluded.
- [ ] **Dry-run** candidate list reviewed against real GCP dependencies,
  billing impact and hold/retention policies; any exception blocks deletion.
- [ ] Explicit one-time owner authorization for each exact bucket/repository
  (or an explicitly reviewed manifest) after read-only evidence.
- [ ] Delete only approved candidates, then reread AR/GCS inventory and
  run Cloud Run health, protected calls and rollback checks; record any
  partial failure as PARTIAL/BLOCKED.

**Preferred order:** accepted cutover → retire Cloud Build triggers →
inventory + dependency graph → verify replacement digests/backups →
dry-run and approve exact targets → remove unreferenced AR images
(if keeping some repository) → remove an **entire** exclusively-owned AR
repository **only when nothing inside is needed** → remove classified
obsolete CI-only GCS objects/buckets → perform final runtime/readback.
Deleting a full AR repository already deletes its contained images; do
**not** separately delete every image beforehand unless a partial
repository cleanup is intended.

**Current evidence/decision:** Repo still contains historical Cloud Build
V2 YAML/trigger references and GHCR publish workflow is not yet a proven
complete Cloud Run promotion pipeline. This document has no verified live
GCS/AR inventory or exclusive-ownership manifest. The former GCS sizes
reported in `cicd-v2-evidence.md` are point-in-time, not current sizes.
Therefore **no Artifact Registry image/repository or GCS object/bucket
is currently approved for deletion under this plan**.

Official Google references:
- [Deleting Artifact Registry repositories](https://cloud.google.com/artifact-registry/docs/repositories/delete-repos)
- [Deleting Docker images](https://cloud.google.com/artifact-registry/docs/docker/manage-images)
- [Cloud Run revision management](https://cloud.google.com/run/docs/managing/revisions)
