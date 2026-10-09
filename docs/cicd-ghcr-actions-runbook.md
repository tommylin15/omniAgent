# omniAgent CI/CD: GitHub Actions → public GHCR → Cloud Run

## 2026-10-09 正式流量已切換；產品驗收仍未完成

依使用者明確授權，GHCR release `1a8e575bb9f6224e698765d268c6e823e94ba55a` 已固定為三服務 100% 正式流量：Chat `00039-rik`、Gateway `00030-coy`、Shared `00019-puf`，live readback 均 Ready=True。正式 Chat health/ready/UI 資產 200，匿名 API 401。Gateway 一個指向 DESTROYED Secret 的失效歷史標籤已移除以完成路由更新；未刪 revision、Secret 或資料。

[完整發布證據與前後快照](production-promotion-2026-10-09.md)。這次是使用者授權的流量切換，未完成既有全部 release gates；真實 Chat provider dispatch、持久化 SSE replay、owner Codex mapping、approval/cancel/reconnect 與正式 rollback 演練仍 OPEN。舊紀錄中的「正式流量未變更」僅適用其各自歷史 checkpoint。不得因此啟用 retention 或舊資源清理。


**Approved architecture, 2026-10-08. Status: GATE #1 AUTOMATIC CHAIN PASS; FORMAL RELEASE/PRODUCT INTEGRATION OPEN.** Policy owner: [SPEC §8](../doc/spec.md#8-cicd-v2); acceptance: [matrix](../doc/acceptance.md); backlog: [TODO](../doc/todo.md). This supersedes the legacy [Cloud Build V2 runbook](cicd-v2-runbook.md) for *new* releases, not its historical evidence.

## 2026-10-09 GHCR-only retention tag lifecycle (implemented, not run)

The post-release-only workflow
`.github/workflows/omniagent-cloudrun-retain-ten.yml`
now includes `scripts/cloudrun_revision_tag_retirement.py`
with unit tests. The `workflow_call` contract requires explicit
`acceptance_and_promotion_passed=true` and
`older_tag_dependencies_cleared=true`. It is not a standalone push
cleanup. It runs unit tests, then on each service sequentially:
1. Dry-run a plan containing only tags on revisions **outside** the
   newest ten; preserve the exact approved new GHCR promoted and
   GHCR fallback Revisions.
2. Re-read service and revision snapshots, fail closed if tagged
   allocation changed, then use only targeted
   `gcloud run services update-traffic --remove-tags`.
   Validate unchanged serving 100% revision and exact remaining tags.
3. Re-run latest-ten dry-run and guarded deletion with a fresh
   runtime snapshot for each irreversible Revision removal.
   No Secret payloads or external legacy CI/CD artifacts are touched.

Tagged 0% revisions can serve requests through tag-specific URLs.
Cloud Run's official `--remove-tags` behavior does not change normal
formal traffic percentages, but **can break clients using removed tag
URLs**; a dependency audit is a hard approval prerequisite. If a
post-mutation readback fails, mark **PARTIAL / BLOCKED**, inspect
runtime evidence; do not claim that prior tag changes were reverted.
Do not run any retirement until browser/owner/Provider acceptance and
a real GHCR-only promotion/rollback drill are complete.

Source `f2a5be4425953b26f2340694765362c7bdc943c9`
passed [full CI / 3 GHCR #37915501123](https://github.com/tommylin15/omniAgent/actions/runs/37915501123),
[three zero-traffic candidate revisions #37915797147](https://github.com/tommylin15/omniAgent/actions/runs/37915797147)
and [signed auto Smoke #37915994575](https://github.com/tommylin15/omniAgent/actions/runs/37915994575).
Latest primary Chat `00037-duj`, Gateway `00028-rof`, Shared
`00017-lob`. Prior all-GHCR fallback Chat `00036-pev`,
Gateway `00027-suw`, Shared `00016-jaz` passed
[read-only two-release gate #37916199053](https://github.com/tommylin15/omniAgent/actions/runs/37916199053).
Shared real three-caller inference
[#37916199074](https://github.com/tommylin15/omniAgent/actions/runs/37916199074)
PASS. Updated live
[retention inventory #37916199040](https://github.com/tommylin15/omniAgent/actions/runs/37916199040):
Chat 26 (16 above ten; 12 outside-ten tags), Gateway 22
(12 above ten; 10 outside-ten tags), Shared 17
(7 above ten; 3 outside-ten tags). **65 existing / 35 excess /
25 outside-ten tags** as of that GCP snapshot. No actual tag or
Revision deletion was performed; all old formal 100% traffic remains
untouched until separate protected promotion.

## 固定 preview 網址與每次發布規則（2026-10-09）

本節只適用 `tommylin15/omniAgent`。固定的是網址，`preview` 所指向的
revision 可隨已驗證的候選發布更新；不必每次重新設定網址或重寫本節規則。

- 正式入口：<https://omniagent-chat-2oo7qbkd5q-uc.a.run.app/>
- 固定 preview：<https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app/>

### 必須遵守的發布順序

1. 確認本次完整來源 SHA、成功 CI/GHCR 發布，以及每個服務的 immutable
   image digest、候選 revision 和 `ghcr-<SHA 前 12 碼>` 標籤相互對應。
   候選 revision 必須 Ready、正式流量為 0%，並通過既有候選驗證。
2. 通過 Chat `/health`、DB-backed `/ready`、首頁及 `/main.dart.js` 的 200
   檢查、未登入 API/dispatch 的 401，以及 Gateway/Shared 私有呼叫邊界與
   signed health/ready 檢查。任一前置驗證失敗，保留上一個已驗證 preview。
3. 在更新前重新檢查來源 SHA，保存原 preview revision、正式流量、服務設定
   和其他標籤；僅更新 Chat 的 `preview` 標籤，不改變正式流量、服務設定
   或其他標籤。不得以 preview 成功代替正式流量切換。
4. 更新後讀回 preview revision、0% 正式流量、固定網址及上述受保護項目，
   再驗證固定網址的健康、就緒、UI 與未授權拒絕行為。更新後驗證失敗時，
   應恢復上一個已驗證 preview，再讀回並確認恢復結果；不得順便覆蓋其他
   發布的變更。恢復失敗或出現併發狀態不明，明確記錄 FAIL/BLOCKED，
   回報實際指向，停止後續发布，不得宣稱已回復。
5. 正式發布仍須完成本 runbook 與 [acceptance](../doc/acceptance.md) 的
   真人 OAuth／owner 隔離、持久化 Chat→Gateway provider 流程、Shared
   真實呼叫、授權及正式 GHCR recovery drill 等既有門檻。preview 通過
   不是正式發布核准，也不是正式 rollback 驗收。

### OAuth 固定來源

設定與驗證固定 preview 的來源
`https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app`。
目前 `apps/agent_app/lib/main.dart` 使用前端 `GoogleSignIn`，Chat 驗證 Google
ID token；本次程式檢查未找到服務端 OAuth redirect callback 路由。
依實際登入模式設定 authorized JavaScript origin；若採 redirect flow，必須
確認並登錄實際完整 callback URI，不可臆造 `/oauth/callback`。
既有 client、固定來源與 callback 路徑不變時，候選 revision 更換不需因此
重設 OAuth；origin/client/callback 改變時才重新檢查設定與真人登入。
OAuth console 設定及本固定來源的真人登入尚未在本次文件工作中驗證。

### 實作與證據狀態（本次僅讀取本機工作樹）

| 項目 | 狀態與限制 |
| --- | --- |
| 同 SHA CI/GHCR → 0% 候選 → signed smoke | 已有已提交 workflow 與本 runbook 的歷史成功紀錄；不是本次新跑的驗收。候選 workflow 檢查 SHA→GHCR digest→Ready revision，smoke 檢查 Ready、digest、標籤、健康與正式流量。 |
| 固定 preview 更新與保護項目讀回 | 本機未提交草稿：`omniagent-ghcr-current-candidate-smoke.yml` 的最後步驟及 `scripts/verify_preview_route.py`。尚未證明這份草稿已經 GitHub CI 或真實發布執行。不可標記部署完成。 |
| 固定網址更新後驗證 | 草稿僅檢查首頁 200；固定網址的 health/ready、UI 資產及未授權拒絕檢查仍待補齊。 |
| 更新後失敗自動恢復 | OPEN：目前草稿沒有恢復步驟；失敗可能留下已變更的 preview。必須補上原版本保存、受保護的恢復、恢復讀回及失敗回報，再驗證失敗情境。 |
| 發布間併發防護 | PARTIAL：有 smoke 自身 concurrency 與更新前 SHA 檢查；候選部署和 smoke 使用不同 concurrency group，尚未證明有共用鎖避免檢查與更新間的競態。 |
| 完整每次發布紀錄 | PARTIAL：現有日志包含 SHA、digest、revision 與驗證結果；草稿 summary 僅寫固定網址與流量保護成功。成功、失敗及恢復結果的完整持久化紀錄仍待補齊。 |
| 固定來源 OAuth／真人登入 | NOT VERIFIED：既有其他入口的登入證據不能直接視為本固定 preview 來源的驗收。 |

### 每次發布紀錄

每次在 Actions summary／本專案證據紀錄保留以下欄位；失敗也必須記錄，
敏感設定只保存遮罩結果，不記錄 token、Secret payload 或完整 runtime config。
必要 checkpoint 可連回 [TODO](../doc/todo.md)，不必每次改写本節固定規則。

```text
source_sha=<完整 40 碼 SHA>
actions_run=<本次 CI / candidate / smoke 證據連結>
chat_revision=<本次候選 revision>
image_digest=<immutable sha256 digest>
preview_before=<上一個已驗證 revision；沒有則明記 NONE>
preview_after=<讀回實際 revision>
fixed_preview=https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app/
validation=<PASS / FAIL / BLOCKED 與失敗 gate>
formal_traffic_and_config=<讀回結果>
recovery=<NOT_NEEDED / PASS / FAIL / NOT_IMPLEMENTED>
production_promotion=<NOT_PERFORMED 或另外核准的證據連結>
```

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
