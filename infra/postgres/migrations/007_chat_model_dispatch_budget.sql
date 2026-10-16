-- Per-Chat-Gateway provider budget ledger, independent of shared Gemini
-- endpoint quota. Installed in omniAgent's own Chat database only.
-- Existing turns remain intact; no model entitlements are granted here.
CREATE TABLE IF NOT EXISTS omni_chat.model_daily_budgets (
  scope text NOT NULL CHECK(scope IN ('global','owner')),
  owner_id uuid NOT NULL,
  utc_day date NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  reserved_tokens bigint NOT NULL DEFAULT 0 CHECK(reserved_tokens>=0),
  PRIMARY KEY(scope,owner_id,utc_day)
);
-- Running and terminal state remain in existing owner-bound turns; a turn can
-- only enter RUNNING once and no failure/cancellation refunds its allowance.
