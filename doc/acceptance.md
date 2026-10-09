# omniAgent acceptance matrix

## Replacement CI/CD — GitHub Actions / public GHCR / Cloud Run (OPEN)

Owner decision 2026-10-08. Requirements below are final production
gates. Some source/build/candidate sub-gates now have observed PASS, while
**Shared real inference PASS for both verified GHCR release sets; human
browser OAuth/two-owner identity, Chat↔Gateway durable provider dispatch,
formal traffic promotion, actual new-GHCR-only traffic rollback drill and
ten-Revision cleanup remain OPEN**. Legacy Cloud Build/AR rollback is no
longer a prerequisite per the 2026-10-09 owner authorization.

**2026-10-09 gate #3 read-only GCP last-ten inventory — PASS; cleanup BLOCKED:**
[Inventory #37914559743](https://github.com/tommylin15/omniAgent/actions/runs/37914559743)
and [precise tagged/serving preflight #37914953148](https://github.com/tommylin15/omniAgent/actions/runs/37914953148)
proved Chat 25, Gateway 21, Shared 16 current Revisions; excess
15 + 11 + 6 = **32**, deletion count **zero**.
A total of **22 tag references on beyond-ten Revisions**
(Chat 11 / Gateway 9 / Shared 2) still exist. All three active
100%-serving Revisions are outside the latest ten, whereas both
approved GHCR-only primary and fallback pairs are inside. Removal
of older tags can invalidate tagged URLs; review actual dependencies
before a post-promotion tag change.
**No tag mutation, traffic reassignment, Revision deletion, Secret
payload read or database write** was performed.
These are concrete prerequisites for post-promotion revision pruning,
not a waiver of application acceptance, a traffic rollback drill
or legacy rollback dependency.

**2026-10-09 Chat hardening and current GHCR candidate verification:**
- **PASS — owner-bound event safety:** commit
  `6ab64229738bb75490231aed93e0d0d759c3aa4b` denies Gateway
  responses with a foreign `ownerId` before writing any model output,
  for Gemini and Codex-native bindings. Node/Python/PostgreSQL/Flutter
  CI and 3 public immutable GHCR packages:
  [#37903996197](https://github.com/tommylin15/omniAgent/actions/runs/37903996197).
- **PASS — exact-source live 0% candidates:**
  Chat `omniagent-chat-00036-pev`, Gateway
  `omniagent-agent-gateway-00027-suw`, Shared
  `omniagent-shared-codex-00016-jaz`;
  [deployment #37904503766](https://github.com/tommylin15/omniAgent/actions/runs/37904503766),
  [auto signed Smoke #37904670566](https://github.com/tommylin15/omniAgent/actions/runs/37904670566);
  both **SUCCESS**, formal traffic unchanged.
- **PASS — strict GHCR-only fallback metadata:**
  previous SHA `c6020ed87fcf4b696f5816e23a34ba7b18350ebb` with
  Chat `00035-ker`, Gateway `00026-xum`, Shared `00015-gew`;
  [#37904836739](https://github.com/tommylin15/omniAgent/actions/runs/37904836739)
  verifies all six Ready, digest, tagged 0%-traffic and ENABLED Secret
  references. This does not prove a real traffic rollback drill.
- **PASS — current Shared real 3-caller provider inference:**
  [#37904946565](https://github.com/tommylin15/omniAgent/actions/runs/37904946565)
  with isolated threads, cross-project denials and traffic protection.
- **PASS (read-only settings inventory), but application integration BLOCKED:**
  [Chat candidate config #37903833063](https://github.com/tommylin15/omniAgent/actions/runs/37903833063)
  shows OAuth Client and internal identity configuration present, while
  `CHAT_DISPATCH_ENABLED` is DISABLED, approved Owner UUIDs = 0,
  candidate Gateway URL/audience do not match. No Secret payload reads,
  DB test writes, model provider calls or traffic changes were made by
  this preflight. Actual two-human-account browser Google OAuth and
  authorized owner-to-Gateway dispatch/provider-event persistence are
  **NOT VERIFIED**; they are prerequisites for formal promotion.
- **Still OPEN:** real app E2E and authorized owner entitlements, bounded
  GHCR-only traffic promotion/rollback rehearsal and 10-revision
  retention. Prior Cloud Build/AR rollback is not a dependency.

**2026-10-09 earlier new-only GHCR release/rollback checkpoint:**
- **PASS — newer exact-source CI/GHCR/candidate/automatic Smoke:**
  `c6020ed87fcf4b696f5816e23a34ba7b18350ebb`:
  [publish #37896498492](https://github.com/tommylin15/omniAgent/actions/runs/37896498492)
  → [candidate #37896743989](https://github.com/tommylin15/omniAgent/actions/runs/37896743989)
  → [auto smoke #37896904915](https://github.com/tommylin15/omniAgent/actions/runs/37896904915),
  all **SUCCESS**. Current Chat `00035-ker`, Gateway `00026-xum`,
  Shared `00015-gew`, each GHCR-pinned, Ready, and 0% formal traffic.
- **PASS — previous new-GHCR recovery target read-only viability:**
  `c7f32b23d4ac4b60d43b3108e69e5b4019e31321` Chat
  `00034-vul`, Gateway `00025-jom`, Shared `00014-lij`.
  [GHCR-only two-release preflight #37897007278](https://github.com/tommylin15/omniAgent/actions/runs/37897007278)
  verified **all six** Ready conditions, immutable digests, tags, enabled
  Secret states, and unchanged formal traffic. Not an actual
  100% → prior-GHCR → 100% traffic rollback drill.
- **FAIL (superseded fallback; intentionally excluded):**
  [#37896367974](https://github.com/tommylin15/omniAgent/actions/runs/37896367974)
  found a previously published GHCR Gateway candidate bound to
  `omniagent-bundle:2` (DESTROYED). Historical Ready is not evidence
  of current rollback safety; this fallback is not eligible.
- **PASS — three-caller real Shared Codex execution:**
  previous verified candidate
  [#37896120562](https://github.com/tommylin15/omniAgent/actions/runs/37896120562)
  and new primary
  [#37897135903](https://github.com/tommylin15/omniAgent/actions/runs/37897135903)
  each returned real inference for the three approved caller principals,
  used isolated fresh threads, denied cross-project calls and preserved
  production traffic.
- **OPEN/BLOCKED — actual release:** human browser OAuth and cross-owner
  account isolation, enabled Chat↔Gateway provider dispatch and replay,
  real rollback traffic rehearsal and formal promotion not yet
  established. No legacy Cloud Build/AR rollback target is required, but
  **missing application acceptance is not waived**. No formal traffic or
  Revision deletion mutation has occurred.

**2026-10-09 earlier Gate #1 — FULLY AUTOMATIC replacement path: PASS**
for immutable source SHA `c7f32b23d4ac4b60d43b3108e69e5b4019e31321`.
[CI/full quality + 3 GHCR #37894051418](https://github.com/tommylin15/omniAgent/actions/runs/37894051418)
**SUCCESS** triggered
[3 Cloud Run zero-traffic candidate revisions #37894312427](https://github.com/tommylin15/omniAgent/actions/runs/37894312427)
**SUCCESS** triggered
[read-only signed live Smoke #37894440766](https://github.com/tommylin15/omniAgent/actions/runs/37894440766)
**SUCCESS**.
Verified Chat `omniagent-chat-00034-vul`,
Gateway `omniagent-agent-gateway-00025-jom`,
Shared `omniagent-shared-codex-00014-lij`, each Ready,
digest-pinned 0% candidate, formal serving route preserved 100% on
the original service revision. Chat /health, /ready and Flutter web HTTP 200;
unauthorized API/dispatch HTTP 401; anonymous Gateway/Shared HTTP 403;
signed authorized Gateway health and Shared health/readiness HTTP 200.
Gateway `gcloud run deploy` CLI reported a nonzero code referencing
previous FAILED tagged revision `omniagent-agent-gateway-00021-boq`
with destroyed Secret version `2`; newer Gateway candidate
`00025-jom` was proven Ready, correct image/tag, secure single
`omniagent-bundle:latest` reference and 0% formal traffic via
independent Cloud Run readback. The workflow retains CLI exit evidence
and fails closed unless a new matching Ready/immutable zero-traffic
revision is verified. Old failed tag remains an explicit diagnostic
anomaly, not a reason to mutate formal traffic or delete historic versions.
**At this older checkpoint** application E2E, browser owners,
real Shared inference, production cutover/rollback and retention were
OPEN; the newer Shared inference sub-gate has now PASSED as documented above.

**2026-10-09 current-path auto-trigger gate** (source
`7937447dd85ef78dbabfe0ca7fd05a703dd99e3c`):
- **PASS — push → exact-source full quality → three GHCR image publishes:**
  [run #37876825619](https://github.com/tommylin15/omniAgent/actions/runs/37876825619).
- **PASS — successful publisher event automatically starts candidate:**
  [workflow_run #37877047775](https://github.com/tommylin15/omniAgent/actions/runs/37877047775).
  Three public immutable GHCR digests checked. Chat revision
  `omniagent-chat-00030-puq` deployed at 0%.
- **FAIL/BLOCKED — complete three-service candidates:** Gateway deployment
  rejected Secret Manager `omniagent-bundle` version `2` as `DESTROYED`
  for existing environment references. Shared never attempted. No formal
  promotion. An approved live Secret/config recovery is required, not a
  synthetic or code-only PASS.
- **PASS — failure-path downstream trigger and safe skip:**
  [smoke workflow_run #37877114127](https://github.com/tommylin15/omniAgent/actions/runs/37877114127)
  was automatically created and skipped after candidate failure.
  **NOT VERIFIED — successful candidate → automatically passing smoke.**
  Full three-service post-failure traffic readback is also unverified.
- Result: **trigger topology PASS; successful end-to-end automatic release
  candidate + smoke BLOCKED.** Formal cutover, rollback and keep-ten
  revisions remain separate OPEN gates.

**2026-10-09 fail-closed Secret version preflight** (source
`e6ef98a7548b40d9807f5ce22e70a6b2795b8e75`):
- **PASS**: full quality, three fresh public GHCR images
  [publish #37877688902](https://github.com/tommylin15/omniAgent/actions/runs/37877688902).
- **PASS**: service/traffic snapshot and all three GHCR digests checked by
  [candidate #37877905596](https://github.com/tommylin15/omniAgent/actions/runs/37877905596).
  Existing formal serving revisions each remained at 100%.
- **PASS (safety)**: `candidate_secret_version_preflight=BLOCKED`,
  every candidate deployment step **SKIPPED before any mutation** because
  CI cannot verify the `omniagent-bundle` Secret version states. This is
  intentional fail-closed behavior. Downstream
  [smoke #37877968631](https://github.com/tommylin15/omniAgent/actions/runs/37877968631)
  automatically SKIPPED.
- **BLOCKED (live recovery)**: Gateway still references Secret version
  `2` explicitly destroyed per prior Cloud Run deployment error; CI
  lacks scoped `secretmanager.versions.get` metadata read for the bundle.
  An authorized administrator must grant metadata-only Secret-scoped access
  and validate an ENABLED, application-compatible replacement before a
  protected zero-traffic-only reference change. **No Secret payload read,
  credential replacement, live production promotion, rollback or keep-ten
  cleanup has been carried out.**

**2026-10-08 verified intermediate evidence** ([detail](../docs/cicd-transition-runtime-evidence.md)):

- [x] Exact SHA `3cf40bc7a9223a5ce7efa630dbd837c4ff57a46a` Node/Python/PostgreSQL/Flutter quality and three public GHCR SHA-256 images: [publish #37768680175](https://github.com/tommylin15/omniAgent/actions/runs/37768680175).
- [x] Three GHCR images anonymously readable and pinned 0%-traffic Cloud Run candidates created without formal traffic changes: [#37768993666 attempt 2](https://github.com/tommylin15/omniAgent/actions/runs/37768993666).
- [x] Candidate image digest/current-serving traffic readback, Chat `/ready=200`, Flutter static Web and unauthenticated API rejection: [#37773167073](https://github.com/tommylin15/omniAgent/actions/runs/37773167073), [#37773639139](https://github.com/tommylin15/omniAgent/actions/runs/37773639139).
- [x] Signed existing Chat identity can invoke Gateway candidate `/health=200` using only narrow IAM `generateIdToken`; signed Shared candidate `/health` and `/ready=200`: [#37773639139](https://github.com/tommylin15/omniAgent/actions/runs/37773639139).
- [ ] **Shared candidate REAL inference remains BLOCKED**: HTTP 502 [#37773850397](https://github.com/tommylin15/omniAgent/actions/runs/37773850397); old AR serving runtime control also returned 502 [#37774120512](https://github.com/tommylin15/omniAgent/actions/runs/37774120512). Public GHCR native CLI binary 0.153.4 smoke PASS [#37774590569](https://github.com/tommylin15/omniAgent/actions/runs/37774590569). CI Cloud Logging diagnostic NOT_AUTHORIZED; do not claim root cause.
- [ ] Full real browser identity/two-owner isolation, signed provider E2E and dispatcher, actual rollback and promotion, 10-revision deletion/readback, old triggers retirement and GCS/AR cleanup remain unaccepted.

- [ ] Normal `main` push runs exact-SHA full Node/API/security, disposable PostgreSQL, Flutter, Python and hygiene gates; observed Actions PASS.
- [ ] All three images published from that SHA, public GHCR visibility and anonymous digest retrieval demonstrated; no credentials embedded.
- [ ] WIF identity/claim restrictions and least privilege GCP permissions read back.
- [ ] Three existing Cloud Run candidate revisions from matching immutable digests, 0% formal traffic and runtime identity/Secret/ingress/VPC/OAuth readback PASS.
- [ ] Live Chat/UI/browser two-owner/provider/dispatcher and Shared three-caller/integration gates PASS; no synthetic pass for unavailable components.
- [ ] Safe promotion, original traffic snapshot, actual rollback drill and traffic readback PASS; stale/partial release cannot alter serving allocation.
- [ ] Final successful deployment job runs ten-revision retention separately for Chat, Gateway and Shared: keep newest 10 (or all if fewer), including the exact latest promoted 100%-traffic revision and previously recorded known-good rollback target. Dry-run, per-deletion state revalidation and final readback PASS; tagged/serving older revisions or rollback outside newest 10 BLOCK cleanup rather than force deletion. Confirm GHCR images unchanged and actual Cloud Run state/permissions.
- [ ] Old Cloud Build push/release triggers disabled only after replacement success; verified new path does not run Cloud Build, explicitly write GCS/Artifact Registry or create Compute Engine.
- [ ] Legacy GCS/Artifact Registry retirement gate: live inventory (all
  buckets/objects and AR images/tags/digests/**repositories**) with owners,
  runtime/service/job/execution dependencies and rollback source; classify
  shared/unknown as BLOCKED; exact-target dry-run + owner-approved manifest
  before deletion and post-delete readback/health. See
  [retirement plan](../docs/legacy-gcs-ar-retirement.md).
  No object, Docker image or repository deletion is claimed from documents.
- [ ] Optional legacy Cloud Build read-only Actions bridge WIF, build status, failure steps and masked error summary tested; no mutation or raw secret exposure.

See [policy](spec.md#8-cicd--github-actions--public-ghcr--cloud-run-2026-10-08)
and [new release runbook](../docs/cicd-ghcr-actions-runbook.md).

## CI/CD V2 checkpoint — ACTIVE / PARTIAL

Four paths: Chat API, Flutter bundled in Chat, Gateway, Shared Codex. Main Push
CI and explicit full-SHA Release are separate. Source safety checks are executable
in `tests/test_cicd_v2.py`; main `741b4e0c` CI PASS and Shared three-caller live
responses/isolation PASS. Chat candidate is zero-traffic, health 200/readiness 503;
Gateway not deployed, recovery and cleanup gates FAIL. Existing provider Secret
absence, human Google Web identity and durable dispatcher gates stay OPEN.
No canonical release, image cleanup or CLOSED claim is made from source tests.

Evidence and operator commands: [V2 runbook](../docs/cicd-v2-runbook.md).
Paused observed results: [V2 evidence](../docs/cicd-v2-evidence.md#paused-checkpoint--2026-10-08).
Owner requested engineering pause and documentation save only.

> Executable baseline validated through `main@d1769491ba41670e86222536ee129b94bbfba04f`; Node Core run `37628904846` PASS. UI source baseline `12a94018debd11f5b389aa2fdf325339782bb9d8`; Flutter run `37625912746` PASS.
> Architecture revision: 2026-10-07.
> Code/design presence cannot substitute for runtime evidence.

## 1. Evidence hierarchy

1. live/runtime/deployment evidence;
2. real environment acceptance;
3. exact-commit CI/test evidence;
4. source evidence;
5. planning/document evidence.

New credential/lakehouse design items in this revision are level 5 until implementation evidence exists.

## 2. Existing checkpoint summary

Recorded Phase 6B evidence previously demonstrated a private omniAgent Gateway candidate and real Gemini/OpenRouter provider probes. It did not demonstrate full Chat/UI deployment, durable Chat→Gateway dispatch, live Chat DB cutover, Codex owner auth, direct Groq, generalized BYOK/platform credentials, omniAgent Iceberg archive, or final writer cutover.

## 3. Core Phase 6B gates

| Area | Required evidence | Current |
| --- | --- | --- |
| exact-head quality | Node + Flutter CI/tests tied to deploy commit | PARTIAL — both pass separately; final single commit gate open |
| Chat DB | independent DB/role + applied migrations + real R/W | OPEN |
| Chat candidate | deployed revision/image + smoke | OPEN |
| OAuth/owner | real browser + stable issuer/subject | OPEN |
| multi-owner isolation | positive/negative tests across Chat/resources | OPEN |
| durable dispatch | Chat→dispatcher→Gateway→events trace | OPEN |
| Gemini full E2E | UI to terminal provider result | OPEN |
| OpenRouter full E2E | UI to terminal provider result | OPEN |
| Codex | owner auth + isolated execution + real turn | OPEN |
| Groq | adapter + real provider + full Chat E2E | OPEN / NOT IMPLEMENTED |
| approval/cancel/reconnect | real runtime/network cases | OPEN |
| MCP/tools | real endpoint + owner/session isolation | OPEN |
| routing cutover | explicit approval after blockers | BLOCKED |

## 4. Credential plane acceptance

Before BYOK/platform credential support may be called accepted:

- [ ] raw secret is stored only in approved secret storage;
- [ ] PostgreSQL contains only owner/provider/mode/profile metadata/reference/status, never raw secret;
- [ ] Flutter never receives the stored raw secret after submission;
- [ ] logs, events, Skills, GCS artifacts and Iceberg rows contain no raw secret;
- [ ] Owner A BYOK cannot be selected/read/used by Owner B;
- [ ] platform credential requires explicit entitlement;
- [ ] non-entitled owner fails closed when requesting platform mode;
- [ ] two owners can use the same platform credential while all memory/thread/tool/artifact/archive state remains separate;
- [ ] audit can identify provider/model and non-secret credential source/profile used for a turn;
- [ ] credential replace/revoke/rotation behavior is tested.

## 5. Codex isolation acceptance

For both personal and platform Codex authorization:

- [ ] owner-specific auth/session execution boundary;
- [ ] owner-specific Codex thread/session mapping;
- [ ] owner-specific workspace/working directory;
- [ ] owner-specific environment/process/tool/MCP context;
- [ ] cancellation cannot target another owner's process/turn;
- [ ] shared platform authorization does not create shared writable session/cache/workspace;
- [ ] cross-owner negative tests prove no transcript/context bleed.

## 6. Data lifecycle/lakehouse acceptance

Before the historical lakehouse is relied on for retention/scale:

- [ ] PostgreSQL remains authoritative for live turn state;
- [ ] large GCS payloads are owner-bound and digest-verified;
- [ ] archive writer is idempotent and restart-safe;
- [ ] archive records preserve owner/thread/turn/event/source IDs;
- [ ] source/archive counts and digests reconcile for sampled and bounded full ranges;
- [ ] archive failure cannot silently mark a live turn complete or delete hot state;
- [ ] physical partition strategy is measured; no unbounded one-partition-per-owner design;
- [ ] compaction/snapshot expiry/retention behavior is tested before scheduled automation;
- [ ] historical conversation reconstruction preserves order and owner authorization;
- [ ] hot-data pruning happens only after archive verification and explicit lifecycle approval;
- [ ] BigLake/BigQuery resources/queries have explicit cost/resource approval and bounded-query evidence.

## 7. Security acceptance

- [ ] authenticated owner binding; no client-supplied owner trust;
- [ ] authenticated internal service calls using omniAgent-owned identity and `X-OmniAgent-*` HMAC headers;
- [ ] no direct omniAgent access to any external system's DB/GCS/Iceberg;
- [ ] approval binding includes owner/thread/turn/request/digest/expiry;
- [ ] MCP sessions cannot cross owners;
- [ ] provider secrets never become Chat memory or analytics data;
- [ ] wrong-audience/expired/unauthorized credential requests fail closed.

## 8. Reliability acceptance

- [ ] retry-safe queued claim;
- [ ] duplicate dispatch does not duplicate externally visible effects;
- [ ] monotonic event sequence and terminal state;
- [ ] crash between provider call and event persistence has recovery semantics;
- [ ] reconnect resumes from persisted cursor;
- [ ] cancellation races tested;
- [ ] archive retries are independent from live turn correctness;
- [ ] rollback/reverse-sync is rehearsed before writer switch.

## 9. Documentation/final rule

Active README/SPEC/WBS/TODO/UI/acceptance/storage/architecture docs must match actual runtime. Point-in-time evidence remains traceable.

The project must not be called final-accepted or production-complete until explicit Phase 9 PASS with exact source, CI, deployment, provider/credential isolation, storage lifecycle, rollback and documentation evidence.


## 10. omniAgent credential/deployment wiring gate

- [x] Gateway source reads `OMNIAGENT_PROVIDER_BUNDLE` and maps
  `mcp_owner_signing_key` → `MCP_OWNER_SIGNING_KEY`.
- [ ] Owner-approved single `omniagent-bundle` must contain four fields
  including `chat_database_url`; Cloud Run Chat and Gateway bindings,
  new key/version and real signed provider calls need runtime acceptance.
  Previous source implementation is not proof of deployed signing-key presence.
- [x] no active config depends on `omniagent-internal-signing-key`.
- [x] Node Core run `37628904846` PASS after the ownership cleanup.
- [ ] `OMNIAGENT_GCP_WIF_PROVIDER` configured and preflight PASS.
- [ ] `OMNIAGENT_GCP_CI_SERVICE_ACCOUNT` configured and proven least-privilege.
- [ ] Historical Artifact Registry build/deploy gate (legacy checkpoint only; **not** required or to be granted for the new public GHCR path).
- [ ] live Cloud Run configuration proves the provider bundle is injected without exposing its value.
