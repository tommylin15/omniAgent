# CI/CD V2 evidence — ACTIVE / PARTIAL

## Source and first Push

- Source commit `a949b758ed366fcc9524170f6e733cd5827a8b90`, real main Push.
- Cloud Build CI `418538b6-83fb-46ae-b069-94ff3708c61c`: FAILURE at step 0.
  Direct Git source and resolved source both equal that full SHA; regional
  `us-central1`, existing `omniagent-ci`, `CLOUD_LOGGING_ONLY`, no source bucket.
- Root cause: SDK method `fetchReadToken` was used as the REST path; the REST
  endpoint is `accessReadToken`. Regression test RED then fix GREEN.
- GitHub Node Core `37721416872`: SUCCESS; Project Hygiene `37721416741`: SUCCESS.
- No V2 image build, candidate deployment or traffic promotion happened in this run.

## Initial resource measurements

- Private repository confirmed; connection `tommy-github` installation COMPLETE.
- CI Push trigger `78b4219e-b65c-4e7f-9d75-0f12f7b87e05`, enabled, `_MODE=ci`, `^main$`.
- Manual Release trigger `14c90fda-6a46-4d04-ae0e-398f4be93fc4`.
- Existing regional build bucket: 1,112,943,932 bytes. Existing legacy US build
  bucket: 3,208,164 bytes. These predate V2; neither was created/deleted here.
- Initial omniAgent registry approximately 1.64 GiB; scanning disabled.
- Actual invoiced cost is not yet obtained; do not report estimates as invoices.

## Explicitly open

Provider bundle absent, human OAuth two-owner evidence missing, durable dispatcher
unimplemented. Canonical release/full live acceptance/CLOSED are not claimed.

## Successful main Push and manual candidate attempt

- Full SHA `7fa347dbf21df7fe82c07a02b4a6c3c3ccb92b07` real main Push:
  Cloud Build `3f228e9a-d4a9-4133-b9e3-f6a05d09af2d` **SUCCESS**.
  Node/API/contract/security, isolated PostgreSQL migration/owner isolation,
  Flutter analyze/test/Web build and release safety checks PASS. CI-only;
  no candidate or formal traffic mutation.
- Manual shadow `d6925968-f5b6-473c-83b8-0cb5d6fc8073`: exact source SHA,
  explicit release SHA and shadow mode verified. SHA/serialization/locks and
  all source gates PASS, then step 5 failed with `python3: command not found`
  in the stable SDK image. No image/candidate/promotion/live acceptance claimed.
- Malformed PowerShell substitutions attempt `09fcc913-94f1-466d-9d45-7ddcd5f5356f`
  failed at argument gate before deployment. Retry used a quoted single argument.
- Fix: builder uses the same Python-enabled SDK slim image proven in other steps.
  Cleanup additionally protects retained Job/Execution images and refuses potentially
  truncated reference inventories. Both fixes have runnable regression checks.
- Local runtime inventory JSON is a point-in-time dry-run only: no images deleted.
- Shadow `e4e66bec-4c10-4024-b11d-9d2c865f6740` on `ffe7def61f77f023b8ed48a8f5c4f6ab4b335210`
  was deliberately cancelled before image build/deploy: Cloud Run's normalized
  digest hid historical SHA provenance and conservatively selected Shared.
  Registry readback proves active Shared digest `sha256:b37b50f33329f29e400d5ca870310f48ae93c02ff2f44fc13235ca37784ad2bf`
  retains unique tag `ff282575fb13163018827761b8bfee8e8789bcb3`.
  Added exact-digest unique-SHA resolution; ambiguous/truncated tags stay unknown.
- Existing own Gateway `omniagent-bundle:2` boolean-only schema preflight:
  Gemini/OpenRouter fields present, `mcp_owner_signing_key` absent. No values logged.
  Approved complete provider bundle reference is still required.
- Real main Push `9c9ff712902bbce9485b7749a77b145c786bbf14`:
  CI `7b4d93c5-7ab2-452d-af77-347b748586d5` **SUCCESS**, all source gates PASS.
- Shadow `36f89d27-975b-43cb-924a-e9e818194c77` recovered Shared baseline
  `ff282575...`, selected only Chat/Gateway and did not rebuild Shared.
  Image step then failed before Docker build because the SDK returns `Image not found`
  instead of `NOT_FOUND`. Replaced message parsing with structured registry SHA-tag
  inventory. No candidate/traffic/live inference from this attempt is claimed.
- Main `b8128b7bb5900a74ceb59c37b9a7f9b3748e4605` CI
  `911e545e-3eb2-4520-955f-be9b7ad2b425` **SUCCESS**. Shadow
  `07d182bd-a24b-4479-a6ce-7e7f02866d85` source gates PASS, then stopped because
  Debian 13 separates `docker-cli` from `docker.io` (daemon); no candidate deployed.
- Toolchain-only build `5d80441f-dff2-49a8-9319-030cc117966d` **SUCCESS**:
  SDK slim + `docker-cli docker-buildx`, Python, Docker client/host daemon and real
  hello-world container. Regional, existing CI SA, CLOUD_LOGGING_ONLY, no source
  upload/staging or new Runtime. Five-minute timeout. Package source:
  https://packages.debian.org/trixie/docker-cli.
- Main `1e39f4659b1eeb63e555cd05f950e521a7cbe624` CI
  `63f298f8-badf-4cd3-9d47-86d39d8e6c1a` **SUCCESS**. Shadow
  `427f285b-60bd-427c-afed-07ac59220820` source + Docker build/push **PASS**:
  Chat digest `sha256:5d348db409428b0b7a9b9f4fff52cd0bbef95b5cad0023acc56c3391298e86c4`;
  Gateway digest `sha256:0dfab02f7533fd607454115afa26c8f740727e4b111b8e249ef86cd47cf4b2c8`.
  Deployment rejected before candidate acceptance: combined traffic tag/service
  name limit is 46 characters. URL tag now uses a 16-hex SHA prefix; full SHA stays
  in image tag, revision identity and runtime label; digest is checked on reuse.
  A regression checks the actual deploy arguments for all three existing services.
- Owner selected administrator completion of the existing Provider bundle runbook.
  No new Secret, key material or Secret/IAM admin grant was made by this task.

## Paused checkpoint — 2026-10-08

Owner requested pause, then documentation save to GitHub. Engineering/deployment
remain paused. Status stays ACTIVE / PARTIAL, never CLOSED.

- Verified source SHA `741b4e0c798bd3d8f569b39961c5e6b7b0f86958`:
  real main Push CI `2b4ea3e7-da60-48f0-857a-eb053b94253c` **SUCCESS**;
  Node/API/security, isolated PostgreSQL, Flutter and 15 release-safety checks PASS.
- Manual shadow build `400898cb-7bff-4a4f-8f94-08b89dc129e9`: source,
  image build/push and no-traffic deployment steps PASS. Live probes ran;
  cleanup step failed closed (`revision digest unavailable`), so final promotion/
  GCS evidence step did not run. Detailed results remain in Cloud Logging.
- Chat candidate `omniagent-chat-v2-741b4e0c798bd3d8f569b39961c5e6b7`,
  image digest `sha256:c9dfca5da831b0cd84f138289b69f4727a4fac31fa1e0cb91c7efa1e7d518721`.
  Candidate health 200, readiness 503; API/DB/owner-isolation and bundled Flutter
  live acceptance are therefore NOT PASS. Independent readback confirms formal
  traffic remains `omniagent-chat-00004-dzs` 100%, candidate 0%.
- DB metadata comparison: active revision references `omniagent-bundle:2`;
  candidate references `omniagent-chat-db:latest`. Both have the same private VPC
  egress and no explicit TLS mode. Active readiness 200 versus candidate 503.
  Reference difference is proven; the precise connection failure remains undiagnosed.
  No DB Secret/configuration/data was changed to repair it.
- Gateway image digest `sha256:142a77d005b6c61706f17b5d694a1d6250705c6545306b4f5e19a22af6d27da5`.
  No candidate deployed: approved provider bundle missing/inaccessible.
  Administrator completion was selected by the owner.
- Shared was NOT rebuilt. Existing revision `omniagent-shared-codex-00004-xmq`
  and existing caller identities retained. **Three real Codex HTTP 200 responses**:
  `life-assistant`, `market-mart`, `omniagent`; each fresh thread and cross-project
  denial PASS. Private IAM/no-anonymous check PASS. Three provider calls consumed.
  Consumer repository adapters were not modified or claimed accepted.
- Automated recovery probe FAIL (`recovery tag revision/traffic mismatch`);
  independent readback confirms original formal traffic and candidate tag retained,
  temporary recovery tag removed. No successful recovery drill is claimed.
- No formal release or image deletion. Human browser OAuth, dispatcher integration,
  Gateway dependency, Chat readiness, recovery and safe cleanup remain OPEN.

This checkpoint preserves observed evidence; it does not resume cloud operations.

## Continued CI/CD V2 source hardening — 2026-10-08

- On resumed engineering instruction, real main commit
  `fd96c9821f0c666c2a39c6c89c0b4d3a4bef6412` changed recovery-tag
  verification and revision image cleanup guards; no Cloud Run traffic,
  Secret, IAM, or external consumer repository mutation was made by this
  GitHub change.
- Recovery now distinguishes a tag's revision/URL from formal traffic,
  accepts an active revision's legitimate nonzero traffic share, checks
  formal traffic after each tag change, rejects tag collisions and
  verifies temporary tag removal. Cleanup refetches missing image digest
  from the actual revision and fails closed on unresolved/mutable references,
  including possibly truncated registry inventories.
- GitHub Actions Node Core run `37737346341` **SUCCESS**: Node 33 PASS/
  1 skipped, Python CI/CD V2 19/19 PASS, Python syntax PASS.
  Project Hygiene run `37737346329` **SUCCESS**.
- These are source-level automated checks, **not** new Cloud Build/Cloud Run
  live acceptance. The previously observed Chat 503 readiness, Gateway
  provider-bundle blocker, pending live recovery/cleanup rerun,
  human browser OAuth and dispatcher work remain OPEN.
- No evidence of a new canonical release, production promotion,
  successful live rollback, or image deletion was collected in this continuation.

## Continued read-only diagnosis and guarded Chat candidate TLS — 2026-10-08

- GitHub Actions workflow `37743601290` **SUCCESS**: Chat candidate
  `omniagent-chat-v2-741b4e0c798bd3d8f569b39961c5e6b7` remains 0%; formal
  Chat revision `omniagent-chat-00004-dzs` remains 100%. Candidate
  `/health=200`, `/ready=503`. No runtime mutation by this diagnostic.
- Dedicated PostgreSQL connection URI was **not printed**. A second read-only
  workflow `37744057330` **SUCCESS** verified URI syntax, dedicated
  `omniagent_chat_app` / `omniagent_chat` identity, password presence,
  private IP, port 5432 and `sslmode=require`. Chat's Cloud Run template
  has private-range VPC egress and a network-interfaces annotation. Candidate
  `CHAT_DATABASE_TLS_MODE` remains UNSET; the dedicated DB Secret is referenced.
- The CI identity could access the DB Secret payload for a local structural
  check but could not describe the Secret version metadata. Those permissions
  are distinct; a failed version-describe is **not** evidence of absence.
  Gateway's approved `omniagent-provider-bundle` version remained
  missing **or** unreadable from CI; admin verification is still necessary.
- Cloud Logging read was denied to CI; no raw app logs were collected.
  Read-only scoped PostgreSQL diagnostic `37743859960` **SUCCESS**:
  an omniAgent-specific `hostssl` / `scram-sha-256` HBA rule exists;
  no matching owner-specific authentication/HBA/TLS logs over six hours
  and no live DB session were found. This does not establish the cause of 503.
- Source commit `646e3e17ab571dfaf1890988e4d4e4a3e61dba18` adds a guarded
  dev-only `CHAT_DATABASE_TLS_MODE=private-self-signed` to **no-traffic** Chat
  deployment, requiring the approved dedicated DB Secret and private VPC
  before use; same-SHA candidate reuse must read back that TLS mode.
  GitHub Node Core `37744282689` **SUCCESS** (Node 33 PASS, 1 skipped;
  V2 Python safety 21/21 PASS); Project Hygiene `37744282680` SUCCESS.
- Self-signed TLS rejection is a **hypothesis**, not a proven cause.
  The source fix has not yet been deployed or exercised against DB readiness.
  No canonical release, traffic promotion, Secret/IAM modification, image
  deletion, or real rollback was performed by this continuation.

## Owner-approved consolidated Secret source change — 2026-10-08

- Explicit owner request overrides the earlier separate-Secret policy:
  **only existing `omniagent-bundle`** is the future runtime credential source.
  Four fields: `gemini_api_key`, `openrouter_api_key`, `mcp_owner_signing_key`,
  and `chat_database_url`. The old `omniagent-chat-db` and pinned legacy
  `omniagent-bundle:2` remain as migration and rollback references; no new
  `omniagent-provider-bundle` Secret resource is authorized.
- Source commit `903e58cecb8a16b093d9d9d51d48169efbe85bf7` adds Chat JSON-bundle
  lookup (legacy DSN fallback for old revisions), 0%-traffic candidate bindings,
  release preflight and Gateway acceptance against the same existing Secret,
  and a privileged local merge helper generating only a missing random signing
  key without printing payloads. Initial CI Node source tests passed but
  Python safety had two test failures, corrected in the follow-up.
- Follow-up commit `15519ce6a28513a2c7be54f14ae66400d3c0adc1` fixes the source
  change-selection expectation, tightens DSN host checking to RFC1918 and adds
  bundled migration tests to Node Core. GitHub Node Core `37746261469`
  **SUCCESS** (35 PASS, 1 skipped; Python release/migration safety 26/26 PASS),
  Project Hygiene `37746261407` **SUCCESS**.
- Consolidation of actual Secret Manager payload, real Chat/Gateway IAM
  readbacks, candidate deployment and DB/provider live acceptance **have not
  yet occurred**. No actual signing key or credential value was printed.
- Security tradeoff: combining provider credentials and DB DSN in one Secret
  necessarily grants both Chat and Gateway access to the full payload;
  Secret Manager IAM cannot restrict access by JSON field. This was
  explicitly chosen by the owner. No claim of equivalent least privilege.

## Consolidated-bundle exact-head verification — 2026-10-08

- Source-only GitHub validation after changes to the tests and CI runners:
  Node Core run `37746628539` SUCCESS; Project Hygiene `37746628464`
  SUCCESS on main `13774154f2c99afe84bf493f10ba6f712ca9cb68`.
- Read-only diagnostic run `37746628454` SUCCESS **as a diagnostic**:
  observed formal Chat traffic 100% on old revision; historical candidate
  `/health=200`, `/ready=503`; `db_dsn_contract=PASS` for the legacy
  dedicated DSN; `unified_bundle_schema=NOT_READABLE` for the CI identity.
  This does not prove Secret absence or Secret payload invalidity, only
  that no verified current unified-bundle access/schema result exists.
- Required manual administrator checkpoint: append a new validated JSON
  version to the **existing `omniagent-bundle`**, and verify resource-scoped
  `roles/secretmanager.secretAccessor` for three existing principals:
  `omniagent-chat`, `omniagent-gateway`, `omniagent-ci`.
  No such Secret Manager version or IAM operation was performed by these
  source/diagnostic runs. Canonical promotion remains BLOCKED.
