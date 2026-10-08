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

## GHCR candidate + integration gate results (same day)

This supersedes the earlier *pre-GHCR* checkpoint above without erasing its
historical asset inventory.

| Gate | Observed result | Evidence |
| --- | --- | --- |
| Single-SHA Node, PostgreSQL, Python, Flutter and security build | **PASS**, SHA `3cf40bc7a9223a5ce7efa630dbd837c4ff57a46a` | [GHCR publisher #37768680175](https://github.com/tommylin15/omniAgent/actions/runs/37768680175) |
| Three published immutable GHCR images, anonymous pull | **PASS** (Shared package manually made public) | [candidate #37768993666 attempt 2](https://github.com/tommylin15/omniAgent/actions/runs/37768993666) |
| Three pinned 0%-traffic Cloud Run candidates | **PASS**; Chat `omniagent-chat-00021-foz`, Gateway `omniagent-agent-gateway-00012-pez`, Shared `omniagent-shared-codex-00005-kih` | same candidate run |
| Runtime digest vs GHCR original | **PASS**; Cloud Run's revision may refer to a **Google-managed Artifact Registry imported image** with the identical digest, while Service template preserves the original GHCR URL | [read-only #37773167073](https://github.com/tommylin15/omniAgent/actions/runs/37773167073) |
| Chat candidate health/readiness + Flutter assets + unauthorized API | **PASS**: `/health=200`, `/ready=200`, homepage and Flutter JS `200`, unauthorized `/v1/threads=401` | [signed smoke #37773639139](https://github.com/tommylin15/omniAgent/actions/runs/37773639139) |
| Gateway Chat runtime identity scoped signed health | **PASS**, `/health=200` via narrow IAM `generateIdToken` (not broad SA TokenCreator) | same signed smoke |
| Shared candidate signed private health/readiness | **PASS**, both `200`; anonymous `403` | same signed smoke |
| Shared candidate **real** provider inference | **FAIL / BLOCKED**, first `omniagent` signed request returned application HTTP `502` before other two callers ran | [inference #37773850397](https://github.com/tommylin15/omniAgent/actions/runs/37773850397) |
| Historical AR **serving** Shared revision provider control | **FAIL / BLOCKED**, signed `life-assistant` request also returned application HTTP `502`. **Not uniquely a GHCR-regression.** | [isolated control #37774120512](https://github.com/tommylin15/omniAgent/actions/runs/37774120512) |
| New GHCR Shared image native CLI smoke | **PASS**, anonymous image pull and bundled `codex-cli 0.153.4 --version` without credentials/network | [binary #37774590569](https://github.com/tommylin15/omniAgent/actions/runs/37774590569) |
| Candidate Cloud Logging diagnosis | **BLOCKED**: CI identity lacks read access; no raw logs/Secret data were exposed | [isolation #37774120512](https://github.com/tommylin15/omniAgent/actions/runs/37774120512) |
| Human browser OAuth / two-owner persisted isolation; real Chat→Gateway dispatcher/provider E2E | **OPEN**, automated Web asset and private /health tests do not prove these gates | [acceptance](../doc/acceptance.md) |
| 100%-traffic promotion, genuine rollback drill, automated keep-10 deletion/readback | **NOT RUN** because mandatory gates are not green | [runbook](cicd-ghcr-actions-runbook.md) |

The formal allocations remain Chat `omniagent-chat-00004-dzs` 100%,
Gateway `omniagent-agent-gateway-00003-k6t` 100%, Shared
`omniagent-shared-codex-00004-xmq` 100% in the last three-service
readback. The Shared serving traffic was reverified 100% in #37774120512.
No production traffic was changed by this acceptance work; no Cloud Build
trigger was disabled and **no GCS/AR image, repository, bucket or application
data was deleted**.

**Next technical blocker:** the real Codex execution layer returns 502 in
both old and new runtime. Resolve using strictly scoped, Secret-redacted
provider/credential/logging diagnostics. Do not assume that GHCR image
format, an expired credential, or an external provider outage has been proven
solely from these HTTP results. CI cannot access the candidate's Cloud
Logging records under current permissions. Subsequent acceptance must rerun
three *real* caller inferences and cross-project denials on the candidate.

**Next administrative blocker:** GCS Bucket list returned
`NO_PERMISSION_OR_UNAVAILABLE`; metadata and object-dependency inventory
must precede any approved Bucket or object deletion. The old Cloud Build
push/release triggers remain enabled until production cutover is accepted.

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
