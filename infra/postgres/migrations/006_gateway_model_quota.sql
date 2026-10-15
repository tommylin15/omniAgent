-- Dedicated Gateway ledger DB: only bounded metadata, never prompts or
-- provider responses. Apply separately using a dedicated DB credential.
CREATE SCHEMA IF NOT EXISTS omni_gateway;
CREATE TABLE IF NOT EXISTS omni_gateway.model_daily_budget (
  scope text NOT NULL CHECK (scope IN ('global','project','owner')),
  project text NOT NULL,
  owner_id uuid NOT NULL,
  day_utc date NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  reserved_token_ceiling bigint NOT NULL DEFAULT 0 CHECK (reserved_token_ceiling >= 0),
  PRIMARY KEY(scope,project,owner_id,day_utc)
);
CREATE TABLE IF NOT EXISTS omni_gateway.model_execution_ledger (
  project text NOT NULL CHECK (project IN ('omniagent','market-mart','life-assistant')),
  request_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  prompt_sha256 char(64) NOT NULL CHECK (prompt_sha256 ~ '^[a-f0-9]{64}$'),
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved','completed','failed')),
  reserved_token_ceiling bigint NOT NULL CHECK (reserved_token_ceiling > 0),
  lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  provider_tokens integer CHECK (provider_tokens IS NULL OR provider_tokens >= 0),
  PRIMARY KEY(project,request_id)
);
CREATE INDEX IF NOT EXISTS model_execution_active_lease_idx
ON omni_gateway.model_execution_ledger(lease_until) WHERE status='reserved';
