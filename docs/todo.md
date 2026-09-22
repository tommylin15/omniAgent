# Phase 5 UI split TODO

- [x] Source split: generic Chat UI and widget tests live in `apps/agent_app`; Janus User App source owns investment User/Admin UI only.
- [x] Janus API build pins pre-split User App Web artifact built from last pre-split source commit `5d24d0638b2667c6c4e9b68620223adef5c08e8d` so later API images retain the legacy Chat UI. Janus deployment runbook records the live revision and rollback command. New image has not yet passed GCP dev validation.
- [x] Local Flutter analyze, test, and Web build completed; GitHub Actions validation added, with remote CI result pending a push.
- [ ] Validate the guarded Janus API image in GCP dev, including `/app` and rollback, without cutting over Chat traffic.
- [ ] Complete omniAgent OAuth, runtime dispatch, Janus bounded context, Skills/MCP APIs, historical owner mapping/export-copy-verify, and live cutover. Phase 5 remains open.

See [UI ownership](ui.md), [Janus migration](migration-from-janus.md), and [cutover runbook](runbook-ui-cutover.md).
