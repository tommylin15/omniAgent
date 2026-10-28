-- GCP_MCP-04: existing Omniagent PostgreSQL database ONLY.
-- Safe first-phase migration: NOLOGIN role, isolated schema/table, no secrets.
-- Never touches omni_chat objects or enables DB network access.
-- Must run as authorized database administrator on existing omniagent_chat DB.
BEGIN;
DO $$
DECLARE
    r RECORD;
BEGIN
    IF current_database() <> 'omniagent_chat' THEN
        RAISE EXCEPTION 'wrong target database';
    END IF;
    IF to_regnamespace('omni_chat') IS NULL THEN
        RAISE EXCEPTION 'existing Omniagent schema not found';
    END IF;
    SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication
      INTO r FROM pg_roles WHERE rolname = 'gcp_mcp_oauth_app';
    IF NOT FOUND THEN
        EXECUTE 'CREATE ROLE gcp_mcp_oauth_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION';
    ELSIF r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR
          r.rolcreaterole OR r.rolreplication THEN
        RAISE EXCEPTION 'existing GCP MCP role has unexpected privileges';
    END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS gcp_mcp_oauth;
REVOKE ALL ON SCHEMA gcp_mcp_oauth FROM PUBLIC;
CREATE TABLE IF NOT EXISTS gcp_mcp_oauth.gcp_mcp_oauth_kv (
    collection TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    ttl DOUBLE PRECISION,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    PRIMARY KEY (collection, key)
);
CREATE INDEX IF NOT EXISTS idx_gcp_mcp_oauth_kv_expires_at
    ON gcp_mcp_oauth.gcp_mcp_oauth_kv(expires_at)
    WHERE expires_at IS NOT NULL;
REVOKE ALL ON TABLE gcp_mcp_oauth.gcp_mcp_oauth_kv FROM PUBLIC;
GRANT USAGE ON SCHEMA gcp_mcp_oauth TO gcp_mcp_oauth_app;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE gcp_mcp_oauth.gcp_mcp_oauth_kv TO gcp_mcp_oauth_app;
ALTER ROLE gcp_mcp_oauth_app IN DATABASE omniagent_chat
    SET search_path = gcp_mcp_oauth;
COMMIT;

-- NOLOGIN is intentional. A separately authorized later phase must set
-- dedicated credentials + verified TLS/HBA/VPC + Secret IAM and acceptance.
