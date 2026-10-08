# CI/CD V2 operations

Policy: [current SPEC §8](../doc/spec.md#8-cicd-v2). Work/evidence:
[TODO](../doc/todo.md), [acceptance](../doc/acceptance.md).
This runbook contains procedures, not a parallel policy.

## Inventory

| Path | Existing artifact/runtime |
| --- | --- |
| Chat API | Chat Dockerfile -> `omniagent-chat` |
| Flutter Web | inside Chat image; no separate hosting service |
| Gateway | Gateway Dockerfile -> `omniagent-agent-gateway` |
| Shared Codex | Shared Dockerfile -> `omniagent-shared-codex` |

No durable worker service is implemented. All original Dockerfiles are retained.
The four old publisher workflows are replaced by the manual V2 entry; PR checks
and read-only diagnostics remain.

## Triggers

Project `gen-lang-client-0593591102`, region `us-central1`, completed 2nd Gen
connection `tommy-github`, Private repository `tommylin15-omniAgent`.
Both use existing `omniagent-ci` and `cloudbuild-v2.yaml`.

| Channel | Trigger ID | Behavior |
| --- | --- | --- |
| main Push CI | `78b4219e-b65c-4e7f-9d75-0f12f7b87e05` | CI-only, no publishing/runtime mutation |
| manual Release | `14c90fda-6a46-4d04-ae0e-398f4be93fc4` | full SHA, default canonical |

```powershell
$releaseSha = git rev-parse HEAD
# Only after reviewed work/tests/dependencies are Ready:
gcloud builds triggers run omniagent-release-v2 --region=us-central1 --project=gen-lang-client-0593591102 --sha=$releaseSha --substitutions=_RELEASE_SHA=$releaseSha
# Explicit development candidate verification; no promotion:
gcloud builds triggers run omniagent-release-v2 --region=us-central1 --project=gen-lang-client-0593591102 --sha=$releaseSha --substitutions=_MODE=shadow,_RELEASE_SHA=$releaseSha,_VERIFY_ALL_PATHS=true
```

The source's resolved SHA must match the explicit requested SHA and current main.
Canonical mode checks the exact SHA's successful Cloud Build CI marker and build
status. Missing dependencies fail before deployment. Successful CI is recorded
only after all source gates; it does not claim any runtime acceptance.

## Evidence and locks

Direct repository source; `CLOUD_LOGGING_ONLY`; no source staging or legacy bucket
creation. User separately approved logWriter, repository-restricted readTokenAccessor
and storage.objectUser limited to `omniagent-cicd-v2/` in the existing regional
Cloud Build bucket. No other IAM/Secret administration was granted.

That prefix holds generation-conditional release/Shared locks, a single atomic
successful-release journal, per-SHA attempts/provider counts and bounded evidence.
Reclaim stale locks only when their owning build is terminal, deleting the exact
generation read with that owner. Never evict active locks by elapsed time.
Kill/failure before the final step leaves a terminal-owner lock for safe reclaim.
Same-SHA images and deterministic candidate revisions are reused.

Compare each component from the last successful release in `releases/current.json`.
Initial historical SHA-tagged active images provide a source baseline; unknown
provenance rebuilds that component conservatively. Shared uses only actual source
and shared dependencies; unrelated docs/tests/CI/Gateway provider edits do not
rebuild it. Truncated comparisons conservatively rebuild rather than skip files.

Max build duration 60 minutes; at most two release attempts and five real provider
calls per SHA. No automatic retries. Outputs/prompts/tokens are not recorded in
evidence. Final gate failure persists evidence and releases owned locks.

## Acceptance and recovery

Node/API/contract/security, disposable PostgreSQL migration/ownership acceptance,
Flutter pub/analyze/test/build, shell/hygiene and release-safety checks precede
build/deploy. Candidate digest/identity/zero-traffic are read back.

Chat's signed-service-account owner probe does not claim human browser OAuth.
Human Google Web two-owner acceptance and unimplemented durable Chat dispatcher
remain explicit business gates. Shared validates its existing three labels and
identities, private ingress, real bounded output, fresh threads and every foreign
project rejection; it does not claim external consumer adapters were deployed.

Recovery drills use an isolated tag candidate -> prior active revision -> candidate,
preserving all active traffic. Partial promotion failure restores/readbacks prior
percentages. A tag recovery drill is not an active-traffic rollback claim.

Cleanup dry-run protects all extant runtime revisions, Job/Execution image references across regions, candidates
and manual recovery tags. Only owned image packages are eligible. Apply requires
accepted release, fresh SHA and renewed references/tags before each deletion.
Scanning stays disabled. Existing shared buckets are never deleted by this task.

## Current blockers

Approved `omniagent-provider-bundle` is absent; do not substitute old credentials.
Human Google Web two-owner evidence and durable Chat dispatcher remain OPEN.
These prevent full canonical release. CI/image success is never CLOSED.
