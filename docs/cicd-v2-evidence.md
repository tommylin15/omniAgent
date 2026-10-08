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
