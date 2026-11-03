BEGIN;
DO $$ BEGIN
  IF current_database() NOT IN ('omniagent_chat','omniagent_acceptance') OR to_regnamespace('omni_chat') IS NULL THEN
    RAISE EXCEPTION 'wrong database/schema for omniagent admin access draft';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS omni_chat.agent_admin_access (
  singleton text PRIMARY KEY CHECK(singleton='global'),
  version integer NOT NULL CHECK(version>=1),
  owners jsonb NOT NULL CHECK(jsonb_typeof(owners)='array' AND jsonb_array_length(owners)<=100),
  updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS omni_chat.agent_admin_access_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version integer NOT NULL UNIQUE CHECK(version>=1),
  owners jsonb NOT NULL CHECK(jsonb_typeof(owners)='array' AND jsonb_array_length(owners)<=100),
  updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON omni_chat.agent_admin_access FROM PUBLIC;
REVOKE ALL ON omni_chat.agent_admin_access_audit FROM PUBLIC;
COMMIT;
-- Draft only; grant the existing Chat DB role required table/sequence access explicitly.
