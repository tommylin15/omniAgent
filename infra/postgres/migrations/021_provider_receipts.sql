BEGIN;
DO $$ BEGIN
  IF current_database()<>'omniagent_gateway' THEN RAISE EXCEPTION 'wrong database for provider receipts'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS omni_gateway;
CREATE TABLE IF NOT EXISTS omni_gateway.provider_execution_receipts (
  execution_id uuid PRIMARY KEY,project text NOT NULL,owner_id uuid NOT NULL,request_id uuid NOT NULL,
  provider text NOT NULL CHECK(provider IN ('gemini','openrouter','groq','codex')),
  model text NOT NULL,actual_model text,source text NOT NULL CHECK(source IN ('assistant','agent','shared-gemini','codex-native')),
  paid_request_id uuid,state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','preflight_rejected','unknown','failed','completed')),
  reserved_at timestamptz NOT NULL DEFAULT now(),dispatch_started_at timestamptz,provider_responded_at timestamptz,
  upstream_status integer CHECK(upstream_status BETWEEN 100 AND 599),settled_at timestamptz,
  input_tokens bigint CHECK(input_tokens>=0),output_tokens bigint CHECK(output_tokens>=0),total_tokens bigint CHECK(total_tokens>=0),
  cost_microusd bigint CHECK(cost_microusd>=0),price_version text,cost_source text,
  CHECK(paid_request_id IS NULL OR paid_request_id=request_id),
  CHECK((cost_microusd IS NULL AND price_version IS NULL AND cost_source IS NULL) OR
    (cost_microusd IS NOT NULL AND price_version IS NOT NULL AND cost_source='paid_model_execution')),
  CHECK(cost_microusd IS NULL OR (provider='gemini' AND paid_request_id IS NOT NULL AND paid_request_id=request_id)),
  CHECK((input_tokens IS NULL AND output_tokens IS NULL AND total_tokens IS NULL) OR
    (input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND total_tokens IS NOT NULL AND total_tokens>=input_tokens+output_tokens)),
  CHECK(provider_responded_at IS NULL OR dispatch_started_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_receipts_nonshared_request
  ON omni_gateway.provider_execution_receipts(project,provider,request_id) WHERE source<>'shared-gemini';
CREATE INDEX IF NOT EXISTS provider_receipts_owner_time ON omni_gateway.provider_execution_receipts(owner_id,reserved_at DESC);
REVOKE ALL ON omni_gateway.provider_execution_receipts FROM PUBLIC;
CREATE OR REPLACE VIEW omni_gateway.unified_provider_execution_usage AS
SELECT execution_id,project,owner_id,request_id,provider,COALESCE(actual_model,model) model,
  source,state,dispatch_started_at,provider_responded_at,upstream_status,
  input_tokens,output_tokens,total_tokens,cost_microusd,price_version,reserved_at created_at
FROM omni_gateway.provider_execution_receipts
UNION ALL
SELECT e.execution_id,e.project,e.owner_id,e.request_id,'gemini',e.model,'legacy-shared-gemini',
  CASE WHEN e.status='completed' THEN 'completed' ELSE 'unknown' END,
  NULL::timestamptz,NULL::timestamptz,NULL::integer,
  NULL::bigint,NULL::bigint,e.provider_tokens::bigint,NULL::bigint,NULL::text,e.created_at
FROM omni_gateway.router_usage_events e WHERE NOT EXISTS(
  SELECT 1 FROM omni_gateway.provider_execution_receipts p WHERE p.execution_id=e.execution_id);
REVOKE ALL ON omni_gateway.unified_provider_execution_usage FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='omniagent_usage_writer') THEN
    GRANT USAGE ON SCHEMA omni_gateway TO omniagent_usage_writer;
    GRANT SELECT,INSERT,UPDATE ON omni_gateway.provider_execution_receipts,omni_gateway.paid_model_execution TO omniagent_usage_writer;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='omniagent_usage_reader') THEN
    GRANT USAGE ON SCHEMA omni_gateway TO omniagent_usage_reader;
    GRANT SELECT ON omni_gateway.unified_provider_execution_usage TO omniagent_usage_reader;
  END IF;
END $$;
COMMIT;
