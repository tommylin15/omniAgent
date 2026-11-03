-- OA-ADMIN-03: versioned administrative DRAFT ONLY. Nothing here enables Gemini paid models.
-- Migration requires existing omniagent_chat DB and omni_chat schema, rollback in docs/agent-loop-roadmap.md.
BEGIN;
DO $$ BEGIN
  IF current_database() NOT IN ('omniagent_chat','omniagent_acceptance') OR to_regnamespace('omni_chat') IS NULL THEN
    RAISE EXCEPTION 'wrong database/schema for omniagent admin settings';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS omni_chat.agent_admin_settings (
  singleton text PRIMARY KEY CHECK(singleton='global'),
  version integer NOT NULL CHECK(version>=1),
  settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS omni_chat.agent_admin_settings_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version integer UNIQUE NOT NULL CHECK(version>=1),
  settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON omni_chat.agent_admin_settings FROM PUBLIC;
REVOKE ALL ON omni_chat.agent_admin_settings_audit FROM PUBLIC;
COMMIT;

-- IMPORTANT: Review the existing Cloud Run Chat DB role SELECT/INSERT/UPDATE
-- grants to both tables and the audit identity sequence before enabling
-- AGENT_ADMIN_SETTINGS_ENABLED. No automatic IAM, role expansion or production migration.
