-- RUA-02B: separate passive execution receipts for existing shared Gemini calls.
-- Opt-in telemetry does NOT enable owner HMAC, rate limits, or provider retry.
-- Each actual invocation gets a server generated execution_id; a repeated
-- consumer request_id can correspond to a separate real invocation.
CREATE SCHEMA IF NOT EXISTS omni_gateway;
CREATE TABLE IF NOT EXISTS omni_gateway.router_usage_events (
  execution_id uuid PRIMARY KEY,
  project text NOT NULL CHECK (project IN ('omniagent','market-mart','life-assistant')),
  owner_id uuid NOT NULL,
  request_id uuid NOT NULL,
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 120),
  status text NOT NULL CHECK (status IN ('completed','failed')),
  provider_tokens integer CHECK (provider_tokens IS NULL OR provider_tokens>=0),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 3600000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS router_usage_events_utc_idx
  ON omni_gateway.router_usage_events (created_at DESC);
-- Store no prompt or model output. No implicit grants to PUBLIC.
