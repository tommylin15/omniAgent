# Phase 5 UI split TODO

- [x] Source split: generic Chat UI and widget tests live in `apps/agent_app`; Janus User App source owns investment User/Admin UI only.
- [x] Janus API image pins the pre-split User App Web artifact from commit `5d24d0638b2667c6c4e9b68620223adef5c08e8d`. Dev revision `janus-api-00154-74s` serves canonical traffic with the legacy Chat UI; candidate and canonical GCP worker acceptance passed.
- [x] Local Flutter analyze/test/Web build and GitHub Actions passed: [Janus CI](https://github.com/tommylin15/janus-omniforge/actions/runs/35705589439), [omniAgent CI](https://github.com/tommylin15/omniAgent/actions/runs/35705540272).
- [ ] Complete omniAgent OAuth, runtime dispatch, Janus bounded context, Skills/MCP APIs, historical owner mapping/export-copy-verify, and live cutover. Phase 5 remains open.

See [UI ownership](ui.md), [Janus migration](migration-from-janus.md), and [cutover runbook](runbook-ui-cutover.md).
