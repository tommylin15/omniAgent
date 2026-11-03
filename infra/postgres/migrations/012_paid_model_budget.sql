BEGIN;
CREATE SCHEMA IF NOT EXISTS omni_gateway;
CREATE TABLE IF NOT EXISTS omni_gateway.paid_model_execution (
  project text NOT NULL, request_id uuid NOT NULL, owner_id uuid NOT NULL,
  model text NOT NULL, price_version text NOT NULL, price_source text NOT NULL,
  input_rate bigint NOT NULL CHECK(input_rate>0), output_rate bigint NOT NULL CHECK(output_rate>0),
  input_ceiling bigint NOT NULL CHECK(input_ceiling>0),output_ceiling bigint NOT NULL CHECK(output_ceiling>0),
  reserved_tokens bigint NOT NULL CHECK(reserved_tokens>0),reserved_microusd bigint NOT NULL CHECK(reserved_microusd>=0),
  actual_tokens bigint CHECK(actual_tokens>=0),actual_microusd bigint CHECK(actual_microusd>=0),
  prompt_tokens bigint CHECK(prompt_tokens>=0),candidate_tokens bigint CHECK(candidate_tokens>=0),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','settled')),
  reserved_at timestamptz NOT NULL DEFAULT now(),settled_at timestamptz,
  PRIMARY KEY(project,request_id),
  CHECK ((status='reserved' AND actual_tokens IS NULL AND actual_microusd IS NULL AND settled_at IS NULL)
    OR (status='settled' AND actual_tokens IS NOT NULL AND actual_microusd IS NOT NULL AND settled_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS paid_model_budget_lookup ON omni_gateway.paid_model_execution(project,reserved_at,owner_id);
REVOKE ALL ON omni_gateway.paid_model_execution FROM PUBLIC;
COMMIT;
