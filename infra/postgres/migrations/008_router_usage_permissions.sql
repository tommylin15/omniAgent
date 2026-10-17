-- RUA-02B | scoped permissions only for omniAgent's dedicated Gateway DB.
-- Run as the owner of omniagent_gateway after the database and the two
-- NO-CREATEDB/NO-CREATEROLE/NOSUPERUSER login roles exist.
-- This migration does not create or alter any non-omniAgent database.
BEGIN;
REVOKE ALL ON DATABASE omniagent_gateway FROM PUBLIC;
GRANT CONNECT ON DATABASE omniagent_gateway
  TO omniagent_usage_writer, omniagent_usage_reader;
REVOKE ALL ON SCHEMA omni_gateway FROM PUBLIC;
GRANT USAGE ON SCHEMA omni_gateway
  TO omniagent_usage_writer, omniagent_usage_reader;
REVOKE ALL ON TABLE omni_gateway.router_usage_events FROM PUBLIC;
REVOKE ALL ON TABLE omni_gateway.router_usage_events
  FROM omniagent_usage_writer, omniagent_usage_reader;
-- Deliberately no SELECT: server emits INSERT ... ON CONFLICT DO NOTHING.
GRANT INSERT (execution_id,project,owner_id,request_id,model,status,provider_tokens,duration_ms)
  ON omni_gateway.router_usage_events TO omniagent_usage_writer;
-- Admin's Chat API gets only read, never INSERT/UPDATE/DELETE.
GRANT SELECT ON omni_gateway.router_usage_events TO omniagent_usage_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA omni_gateway REVOKE ALL ON TABLES FROM PUBLIC;
COMMIT;
