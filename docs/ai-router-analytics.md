# AI Router Usage War Room — implementation and operating contract

Checkpoint: 2026-10-17. **RUA-01 CODE+CI PASS** on exact SHA `6bf1c28` ([full CI](https://github.com/tommylin15/omniAgent/actions/runs/38990748520)). **RUA-02 production configuration and live acceptance NOT VERIFIED.**
Authoritative actual state is GitHub `main`, CI and Cloud Run/DB readback, not this design document.

## Goal and UX

Admin-only, read-only Flutter **AI Router 戰情室**, reachable from Chat's AppBar for an
explicitly authorized Google OAuth Owner. Mobile first: 1 / 7 / 30 UTC-day window,
project/provider/status dropdown filters, Owner UUID substring search, five summary
tiles (including settled success rate), top-ten model bars, separate project+Owner rankings
with tap-to-filter, compact detail rows, clipboard CSV of the currently
filtered rows. Never expose prompts or credentials. No cross-owner capability
for ordinary Chat users. UI must state a missing data source as unavailable,
not zero use; provide timestamps, UTC definition and provenance.

The two independent counting series are intentionally *not additive*:

1. **Shared Gemini Gateway** — from `omni_gateway.model_execution_ledger`,
   one row per unique `(project,request_id)`. Includes only quota-reserved
   requests and outcomes: `reserved/completed/failed/unreconciled`. It omits
   invalid request, IAM/owner denial, busy and quota denial that happened
   **before reserve**. `unreconciled` is an expired active lease, not a
   confirmed provider failure. Gemini usage `provider_tokens` is provider
   reported **total** tokens when settlement recorded it; if any member of
   an aggregated row lacks them, aggregate tokens are **null**, not 0.
2. **Chat** — from `omni_chat.turns` joined to owner-bound
   `omni_chat.threads`; one distinct turn per owner/thread/turn identity,
   grouped by day/runtime/model/status. Queued, running, error and completed
   *turns* do **not** reliably assert a billable provider API invocation.
   Chat Token and cost remain null; do not derive them from prompt length,
   quota reserved ceiling or an arbitrary fallback.

The existing shared Gateway ledger covers its three *code enum*
project keys `omniagent`, `market-mart`, and
`life-assistant` (Life integration); **not** arbitrary direct consumer
model calls, and no guarantee it was configured/recording in a given deployment.
Composite `(project,owner_id)` is the logical distinct owner, because
consumer owner UUIDs may have different namespaces.

## Implementation map

- `services/chat-api/router_usage.ts`: strict read-only aggregated Postgres
  query, backend response validation, fixed bounded time windows, source coverage.
- `GET /v1/admin/router-usage?days=1|7|30`:
  Google-verified user → DB-derived `owner_id` → exact admin allowlist →
  read two independent sources. Wrong user 403, no token 401,
  disabled feature 404, invalid time 400. No client owner ID input.
- `GET /v1/me`: adds `routerStatsEnabled` boolean; display only, never
  substitutes for the server's independent admin gate.
- `apps/agent_app/lib/router_usage_page.dart`: Flutter mobile/desktop
  drilldowns, selection and CSV copy. No direct Gateway/public DB access.
- `tests/router_usage.test.ts`: cardinality, missing data, parameter
  bounds, unauthorized user, non-admin Owner and server-side access tests.

## Configuration and security

All are **opt-in**. Do not automatically switch production:

| Env | Requirement |
| --- | --- |
| `ROUTER_USAGE_ENABLED=true` | Enables admin route; otherwise 404/hidden |
| `ROUTER_USAGE_ADMIN_OWNER_IDS` | Nonempty comma-separated **verified owner UUIDs**; malformed config fails at startup |
| `ROUTER_USAGE_GATEWAY_DATABASE_URL` | Optional **separate read-only** DB role DSN with `sslmode=require`, SELECT only on the Gateway execution ledger |
| `ROUTER_USAGE_GATEWAY_CA_PEM` | Required alongside above DSN; explicit verified CA |
| `ROUTER_USAGE_GATEWAY_TLS_SERVERNAME` | Expected certificate DNS SAN if DSN uses an IP |

Existing Chat Postgres role reads own hot-state tables. If the Gateway read
connection is not supplied, the API explicitly returns
`sources.sharedGemini = not_configured`. Connection errors yield `unavailable`
and do **not** silently zero-out the history.

**IAM/DB duty separation:** grant the optional analytics Gateway DB account
`SELECT` on the needed columns/table only, never `INSERT/UPDATE/DELETE`
or quota-writer privilege. PostgreSQL requires a separately managed
credential. Do not repurpose the Gateway's quota-writer DSN or paste any
secrets into GitHub, logs or this document. Google OAuth user JWT and Owner
allowlist are mandatory independently of Cloud Run ingress.

Data response:
```json
{
  "generatedAt":"RFC3339-UTC","days":7,"timezone":"UTC",
  "sources":{"chatTurns":"available","sharedGemini":"available|not_configured|unavailable"},
  "truncated":false,
  "rows":[{
    "source":"chat_turns|shared_gemini",
    "day":"YYYY-MM-DD","project":"omniagent",
    "ownerId":"UUID","provider":"gemini","model":"gemini-...-lite",
    "status":"completed","calls":1,"tokens":null
  }]
}
```
Counts are grouped by UTC day, project, Owner UUID, provider, model and status.
SQL query windows are fixed to 1/7/30 inclusive UTC calendar days; each source
is limited to 5001 grouped rows and the response flags truncation instead of
claiming completeness. Flutter detail cards render at most 250, CSV copy keeps
all source-returned rows. Never export prompts, raw OAuth subject/email, API
keys, credential IDs or raw provider errors. Copying to clipboard uses safe
CSV cell escaping and neutralizes spreadsheet formulas.

## Phased expansion (do not conflate with existing P0)

1. **RUA-01 foundation (source code)**: above read-only admin API, UI, tests,
   and documentation. No migrations required for current schema. Pass CI
   before declaring DONE-CODE.
2. **RUA-02 production wiring**: add approved Admin UUID and dedicated
   verified-TLS read-only Gateway DB credential, apply minimal permissions,
   verify 401/403/200 and actual non-secret rows for multiple projects,
   verify no prompt/secret response, perf under load, mobile Flutter.
   Explicit operational approval and runtime evidence required.
3. **RUA-03 full provider telemetry**: add one canonical per-invocation
   ID to each Gateway provider execution (Gemini Chat, Codex, OpenRouter,
   Groq when accepted); safely include project+Owner scope, requestId,
   provider/model, attempt state, latency, provider-reported split
   input/output tokens, error category, credential *class* and pricing
   snapshot version. Enforce idempotent insert, async/nonblocking
   persistence fail-safe, retention and delete policy. Do not store text.
   Include Gateway denied-before-reserve attempts as a separate count.
   Reconcile Chat turn ↔ Gateway execution via explicit invocation IDs;
   **only after that** show truly de-duplicated totals.
4. **RUA-04 operational analytics**: validated cost snapshots only when
   pricing/provider usage is known, per-project budgets, anomaly alert,
   optional scheduled daily rollups and archival only if volume warrants.
   Do not infer paid spend from Gemini's free-tier quotas or a rate-card
   without a billing-source match.

## Acceptance gates

- Unauthorized bearer, invalid JWT, ordinary valid Owner → no data.
- Exact admin Owner → only read-only, bounded, well-defined source rows.
- Owner change/logout destroys prior UI state; no cache leak.
- Duplicate request in Gateway ledger counted once; a failed settle never
  becomes a success; null tokens remain null; two sources never summed.
- A ledger source failure visibly reports `unavailable`, with Chat still visible.
- Query EXPLAIN and indexing only after measured PostgreSQL row counts;
  do not create high-cardinality per-Owner indexes without evidence.
- `npm run build && npm test`, Flutter analyzer/tests/web, exact-SHA CI,
  0%-traffic deployment, authorization negative tests and runtime verified
  readback; `PARTIAL` until all target-scope gates have passed.

## Known limitations as of design

No verified cost in currency, no input/output split on old Gateway ledger,
no success proof for Chat model turns, no non-Gemini Gateway telemetry,
no cross-service canonical correlation, no guarantee of retention outside
existing DB policies, no production admin/readonly DSN configuration
or end-to-end dashboard user acceptance receipt. **Do not mark DONE.**

## 2026-10-17 RUA operational checkpoint

- RUA-01 exact SHA `6bf1c28`: Node/Flutter/Postgres CI PASS #38990748520, three GHCR digests PASS #38990748509, 0% Cloud Run candidates PASS #38991162650, private candidate smoke PASS #38991272976.
- One-shot release #38991332177: promotion step PASS, whole workflow **FAIL** at Shared Codex old tagged Revision retention (`older_revision_has_live_tag`). Do not treat the success of `notify` or promotion alone as full acceptance. Formal traffic readback and any tag changes require independent evidence.
- Admin statistics flag, Google OAuth-bound Owner allowlist and separate Gateway **SELECT-only** PostgreSQL credentials remain **RUA-02 NOT VERIFIED**. Without those, the dashboard intentionally stays hidden and provider coverage unavailable; no invented data.
- Security: release artifact upload pattern is constrained to specific receipt files after an unsafe glob was detected; exact impacted artifact `12085157906` was deleted with readback (Actions #38991688176).

- Independent readback [#38991930476](https://github.com/tommylin15/omniAgent/actions/runs/38991930476): Chat `00124-hup`, Gateway `00101-fec`, Shared Codex `00078-vap` are Ready and serving 100% each; 44/32/31 historical revisions with many old 0%-tag routes. Chat's `ROUTER_USAGE_ENABLED`, `ROUTER_USAGE_ADMIN_OWNER_IDS`, dedicated ledger DSN and trusted CA are not set. Thus RUA-02 live analytics **NOT ENABLED**, despite the successful source and production image promotion.

## RUA-02 runtime split (2026-10-17)

**Phase A deployed, partial**: preflight [#39021269576](https://github.com/tommylin15/omniAgent/actions/runs/39021269576) verified previously supplied Owner UUID has Google OAuth owner mapping. Controlled rollout [#39021649125](https://github.com/tommylin15/omniAgent/actions/runs/39021649125) enables Chat admin statistics for this one Owner only, preserving all old env, runtime identity, image digest and disabled Chat Dispatch. Zero-traffic candidate health and unsigned 401 PASS; revision omniagent-chat-00128-ver confirmed 100% live. No valid delegated human OAuth token was tested, so admin API 200 and mobile UI E2E are still OPEN.

**Phase B blocked by source absence**: the 100%-traffic Gateway revision lacks GEMINI_SHARED_LEDGER_DATABASE_URL and verified CA; the read-only database inventory found no dedicated omniAgent Gateway ledger database. Gateway calls therefore cannot be asserted as a complete actual Owner/model tally. sharedGemini must stay not_configured; do not backfill inferred zeros. GEMINI_SHARED_QUOTA_ENABLED would require owner authorization HMAC and alter consumer contracts, so do not enable it merely for analytics. Build an independent event capture path with least privilege, verified TLS and measurable coverage before promoting Phase B to DONE.
