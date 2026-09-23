# omniAgent acceptance matrix

> Baseline: `main@4a5f74ca60c0859a8727568290b388101cbae6c1`.
> Acceptance is evidence-based. Code presence, document completion, image build, or a partial smoke test cannot substitute for an end-to-end gate.

## 1. Evidence hierarchy

For a feature to be accepted, use the strongest applicable evidence:

1. **Runtime/live evidence** — deployed revision/image, identity, traffic, real request/response, storage state, integration behavior.
2. **Environment acceptance** — repeatable dev/staging test against real dependencies and real auth boundaries.
3. **CI/test evidence** — exact commit, test suite, result, explained skips.
4. **Source evidence** — implementation exists and matches the requirement.
5. **Planning/document evidence** — accepted design only; never sufficient for live completion.

A higher-level claim must not be inferred from a lower-level artifact.

## 2. Current evidence snapshot

### Confirmed checkpoint evidence

The recorded Phase 6B dev checkpoint demonstrates:

- private omniAgent Gateway candidate deployed;
- real Gemini dispatch passed;
- real OpenRouter dispatch passed;
- Chat/UI image built;
- Janus MCP protected-resource/auth metadata and negative guards remained functional;
- local Node/Flutter checks passed at that checkpoint;
- Janus remained the live Chat writer;
- Chat/UI was not deployed;
- independent `omni_chat` DB/role/migrations were not applied;
- Chat API had no live dispatch worker;
- real omniAgent MCP/Janus-context owner-isolated integration was not accepted;
- Codex managed auth was not accepted;
- historical copy/reverse-sync/write cutover were not performed.

### Newer source after that checkpoint

Latest reviewed `main` additionally contains:

- Google ID-token web sign-in integration in Flutter;
- Chat candidate smoke Cloud Build config;
- dev Chat DB setup script.

These are **source changes only** for this acceptance review because the reviewed head commit has no attached GitHub workflow/status evidence and no new live deployment evidence was observed.

## 3. Phase gate matrix

| Gate | Requirement | Current result | Acceptance needed |
| --- | --- | --- | --- |
| Phase 0 | Baseline/freeze | PASS | Historical checkpoint retained. |
| Phase 1 | Independent repo/build boundary | PASS | Historical checkpoint retained. |
| Phase 2 | Contract/security split | PASS | Historical checkpoint retained. |
| Phase 3 | Bounded Janus boundary | PASS-CHECKPOINT | Live context integration still belongs to Phase 6B. |
| Phase 4 | Chat API/storage target | PASS-CHECKPOINT | Live storage/write ownership still open. |
| Phase 5 | UI extraction | PASS-CHECKPOINT | Live deployed UI still open. |
| Phase 6 | Deployment plan | PASS | Plan exists; execution not implied. |
| Phase 6B | Real dev deployment / acceptance | **PARTIAL / FAIL for full acceptance** | Complete all blocking rows below. |
| Phase 7 | Janus cleanup | BLOCKED | Phase 6B full acceptance + explicit cleanup approval. |
| Phase 8 | Documentation/stale-reference migration | IN PROGRESS | Current control docs + both-repo stale reference review. |
| Phase 9 | Final acceptance | BLOCKED | All previous gates and final runtime/storage/doc reconciliation. |

## 4. Phase 6B blocking acceptance matrix

| Area | Test | Required evidence | Current |
| --- | --- | --- | --- |
| Exact-head quality | Node build/tests + Flutter analyze/tests/build | CI/test tied to deployed commit | OPEN for latest head |
| Chat DB | independent DB/role + migrations | DB/schema query evidence | OPEN |
| Chat candidate | deploy Chat API + Flutter Web | revision/image/config + smoke | OPEN |
| OAuth | real browser Google login | origin/audience/token acceptance + invalid-token rejection | OPEN |
| Owner identity | stable issuer+subject owner mapping | repeated login + DB identity evidence | OPEN-LIVE |
| Owner isolation | two-owner positive/negative tests | cross-owner access denied across all resources | OPEN |
| Chat dispatch | queued turn claimed and executed | Chat→worker→Gateway→event storage trace | OPEN |
| Gemini E2E | UI message to Gemini response | full trace, terminal event | OPEN (Gateway-only probe already passed) |
| OpenRouter E2E | UI message to OpenRouter response | full trace, terminal event | OPEN (Gateway-only probe already passed) |
| Codex E2E | owner auth + session + turn | owner-scoped auth secret and real turn | OPEN |
| Approval | allow/deny exact request | owner/thread/turn/request/digest/expiry binding | OPEN-LIVE |
| Cancel | queued and running cancel | correct terminal state + no duplicate effects | OPEN-LIVE |
| Event replay | cursor replay | no gaps/duplicates | SOURCE DONE / LIVE OPEN |
| Reconnect | browser/network interruption | resume from cursor without loss/duplication | OPEN |
| MCP | discover + call + cancel/disconnect | real MCP endpoint, owner/session isolation | OPEN |
| Janus context | bounded real context call | service auth + user/owner authorization + no direct data access | OPEN |
| Skills | public management + owner isolation | revision/state API and UI | OPEN |
| Historical mapping | export/copy/verify if required | counts/digests/reconciliation | OPEN |
| Rollback | post-cutover reverse-sync | rehearsed recovery/no loss/duplication | OPEN/BLOCKING |
| Routing cutover | switch live Chat writer | explicit approval after all blocking gates | BLOCKED |

## 5. Security acceptance

The following are mandatory before any live writer cutover:

- [ ] no credentials persist in event or Skill payloads;
- [ ] Secret values absent from repository, frontend, image layers, build substitutions, logs;
- [ ] Chat internal endpoints accept only intended service audience + allowlisted identity;
- [ ] Gateway internal calls use authenticated service identity/request binding;
- [ ] no omniAgent direct access to Janus DB/GCS/Iceberg/internal packages;
- [ ] no global user token used to simulate multi-owner Janus/MCP acceptance;
- [ ] approval binding includes owner/thread/turn/request/operation/digest/expiry;
- [ ] Codex owner auth is isolated and lifecycle-tested;
- [ ] MCP sessions cannot cross owners;
- [ ] invalid/expired/wrong-audience tokens fail closed.

## 6. Reliability acceptance

- [ ] queued turn claim is retry-safe;
- [ ] duplicate dispatch cannot create duplicate externally visible effects;
- [ ] event IDs and sequence replay are stable under retries;
- [ ] worker crash between Gateway call and event persistence has a documented recovery path;
- [ ] reconnect resumes correctly after network interruption;
- [ ] terminal states are monotonic and auditable;
- [ ] cancellation races are tested;
- [ ] rollback path is rehearsed before any live writer switch.

## 7. Data migration acceptance

If historical Chat/Skill data must move:

1. freeze/export source view or define a reproducible cutoff;
2. map source identity to omniAgent owner deterministically;
3. copy non-destructively;
4. verify counts, keys, event ordering, content digests as appropriate;
5. report unmatched/invalid records explicitly;
6. preserve Janus source until reconciliation is accepted;
7. do not call partial copy a successful migration;
8. do not switch writer until post-cutover rollback/reverse-sync is proven.

## 8. Documentation acceptance

Before Phase 9 PASS:

- [ ] `README.md` matches real runtime ownership;
- [ ] `doc/spec.md`, `doc/wbs.md`, `doc/todo.md`, `doc/ui.md`, `doc/acceptance.md` match exact deployed state;
- [ ] existing `docs/` history remains traceable and point-in-time claims are not silently rewritten into present tense;
- [ ] Janus active docs no longer claim ownership that has actually moved;
- [ ] omniAgent docs do not claim ownership that has not actually moved;
- [ ] stale service/path/env/API references are scanned in both repositories.

## 9. Final declaration rule

The phrase **`OMNIAGENT SPLIT COMPLETE`** is prohibited until Phase 9 is explicitly recorded as PASS with exact source, CI, deployment, live integration, storage, rollback, and documentation evidence.

Any earlier state must be labeled with its actual scope, e.g. `source complete`, `candidate built`, `provider probe passed`, `partial Phase 6B`, or `cutover not accepted`.
