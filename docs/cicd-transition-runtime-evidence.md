# omniAgent GHCR cutover: observed runtime checkpoint (2026-10-08)

**Read-only evidence and source changes, not production cutover acceptance.**
GCP project `gen-lang-client-0593591102`, region `us-central1`.
Sources: [GitHub inventory #37767798184](https://github.com/tommylin15/omniAgent/actions/runs/37767798184)
and [scoped metadata inventory #37768217815](https://github.com/tommylin15/omniAgent/actions/runs/37768217815).
Both used the dedicated omniAgent WIF identity and made no resource changes.

## Runtime observed before GHCR cutover

| Asset | Observed evidence | Cleanup |
| --- | --- | --- |
| `omniagent-chat` | current formal traffic **100%** to `omniagent-chat-00004-dzs`; image registry **AR**; 9 revisions (all AR) | BLOCKED |
| `omniagent-agent-gateway` | current formal traffic **100%** to `omniagent-agent-gateway-00003-k6t`; image registry **AR**; 5 revisions (all AR) | BLOCKED |
| `omniagent-shared-codex` | current formal traffic **100%** to `omniagent-shared-codex-00004-xmq`; image registry **AR**; 4 revisions (all AR) | BLOCKED |
| AR `omniagent`, `us-central1` | repository exists, type `DOCKER` / `STANDARD_REPOSITORY` | BLOCKED |
| AR package names | `omniagent-chat`, `omniagent-agent-gateway`, `omniagent-shared-codex`, `omniagent-postgres` (four total) | BLOCKED; do not assume Postgres unused |
| Cloud Build push trigger `omniagent-main-v2` | ID `78b4219e-b65c-4e7f-9d75-0f12f7b87e05`; **enabled** | DO NOT DISABLE until accepted replacement |
| Cloud Build release trigger `omniagent-release-v2` | ID `14c90fda-6a46-4d04-ae0e-398f4be93fc4`; **enabled** | DO NOT DISABLE until accepted replacement |
| GCS candidate `gen-lang-client-0593591102-cloudbuild-regional` | bucket describe returned `NOT_READABLE_OR_NOT_FOUND` | UNKNOWN; NOT approved for deletion |
| GCS candidate `gen-lang-client-0593591102_cloudbuild` | bucket describe returned `NOT_READABLE_OR_NOT_FOUND` | UNKNOWN; NOT approved for deletion |
| GCS project bucket enumeration | `NO_PERMISSION_OR_UNAVAILABLE` under CI WIF | UNKNOWN; cannot compile authoritative deletion list |

Do not print secrets or raw Bucket contents into GitHub Actions logs. The
two named GCS buckets are **historical identifiers only**, not verified
present assets. An administrator-scoped read-only bucket inventory is
required to distinguish absence from insufficient IAM.

## GitHub-side migration

- The GHCR publisher now includes ordinary source changes on `main` in
  its path triggers and runs full Node/DB/Flutter/security checks before
  image build. The first [run #37767763854](https://github.com/tommylin15/omniAgent/actions/runs/37767763854)
  passed quality, but **all three publish jobs failed closed on stale
  commit SHA** because newer commits landed before image publication.
  This is expected protection, not published GHCR image evidence.
- `.github/workflows/omniagent-ghcr-cloudrun-candidate.yml` is a new
  **candidate-only** workflow: after successful exact-main publisher,
  it requires an anonymous GHCR pull test for all three immutable
  digests before any Cloud Run deploy; then requests only zero-traffic
  candidates and checks traffic/config readback.
- Retaining latest ten revisions is implemented as a separate gated
  release-final workflow, **not yet wired to a verified full release**.
- Human browser OAuth with two real users, durable Chat→Gateway dispatch,
  provider/approval/reconnect, Shared caller full live acceptance,
  protected promotion and real rollback remain **OPEN**.
- No changes to formal traffic, Cloud Build triggers, GCS or AR were made
  by the inventory jobs. GHCR/Cloud Run cutover has not been proven.

## Removal rule

Follow [legacy GCS/AR retirement](legacy-gcs-ar-retirement.md): when exact
head full CI, public GHCR immutable digests, three production cutovers,
all integration tests and genuine rollback readback have **all passed**,
retire legacy Cloud Build triggers. Then obtain separate **live** GCS
Bucket/object and AR image repository dependency inventory (including
Postgres/Cloud Run Jobs and every historical retained revision). List
only exclusively-owned, unreferenced, CI-only resources; keep shared
assets, DB backups, application GCS objects, unknown and held resources.
Delete only evidence-approved targets and rerun live health/readback.

**Checkpoint result: PARTIAL / BLOCKED for production cutover and deletion.**
