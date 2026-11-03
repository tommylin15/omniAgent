# Source-only /ponytail-review — 2026-11-03

What this change does: Adds the Agent Worker, paid model gates, credential lifecycle, Admin/UI, durable message intents, data/jobs and provider execution receipts described in the source checkpoint. This review is limited to source and connected callers, configuration, migrations and authored tests.

The reviewer inspected uncommitted and untracked source in this repository, including Owner isolation, L2 exact approvals and one-way write claims, paid reservations, lease fencing, archive unknown outcomes, deployment paths, queue quotas and the Flutter/API handoff. Assumed load is multiple authenticated owners and more than one service instance; deployment scripts initially limit new Workers to one instance while database constraints remain necessary.

Must-fix source findings addressed:

1. Worker Dockerfiles had no publishing path. Added the explicit exact-main-SHA three-image workflow; no automatic deployment is attached.
2. Text artifacts and the JSON-only writer were incompatible. The writer now preserves original text/JSON bytes in its envelope and verifies the original digest on snapshot readback.
3. Cross-device cancellation could strand a local pending key. Added exact key tombstone readback, clearing only verified cancellation and resolving the existing local key before adopting another device's latest intent.
4. Shared consumer request IDs are not individual invocation IDs. Non-shared requests use a partial unique replay guard; Shared executions retain their original distinct execution IDs and correlation request IDs. The view deduplicates exact execution IDs only.

Additional source checks added canonical Cloud Run candidate-tag/audience matching, explicit artifact/job/analytics quotas, Owner guards and required verified TLS/configuration. Known native Codex invocation evidence remains explicitly unavailable; no synthetic count or cost is emitted.

Verdict: Source checkpoint may be published for the user-requested post-push validation phase. This is not a production Ship verdict.

Not checked: TypeScript/Flutter/Python execution, builds, dependency installation, SQL application, GitHub CI, live provider calls, IAM/Billing, deployment or runtime/E2E. All remain NOT_RUN. No claim of compilation, passing tests or full product completion is made.
