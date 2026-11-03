BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('omniagent_chat','omniagent_acceptance') OR to_regclass('omni_chat.turns') IS NULL THEN
  RAISE EXCEPTION 'wrong database/schema for agent runtime';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS omni_chat.agent_runs (
 owner_id uuid NOT NULL, run_id uuid NOT NULL, thread_id varchar(128) NOT NULL,
 turn_id varchar(128) NOT NULL, question text NOT NULL CHECK(octet_length(question)<=8192),
 policy jsonb NOT NULL, status text NOT NULL DEFAULT 'queued'
 CHECK(status IN ('queued','running','completed','cancelled','blocked','failed')),
 fence bigint NOT NULL DEFAULT 0, lease_until timestamptz,
 checkpoint jsonb NOT NULL DEFAULT '{"steps":0,"toolCalls":0,"observations":[],"phase":"ready","tokens":0,"costMicros":0}',
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,run_id), UNIQUE(owner_id,thread_id,turn_id),
 FOREIGN KEY(owner_id,thread_id,turn_id) REFERENCES omni_chat.turns(owner_id,thread_id,turn_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS omni_chat.agent_steps (
 owner_id uuid NOT NULL, run_id uuid NOT NULL, sequence bigint GENERATED ALWAYS AS IDENTITY,
 fence bigint NOT NULL, checkpoint jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,run_id,sequence),
 FOREIGN KEY(owner_id,run_id) REFERENCES omni_chat.agent_runs(owner_id,run_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS omni_chat.agent_tool_receipts (
 owner_id uuid NOT NULL, run_id uuid NOT NULL, action_id uuid NOT NULL,
 digest char(64) NOT NULL, expires_at timestamptz NOT NULL,
 tool_name text NOT NULL, input jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','approved','executing','confirmed','unknown')),
 result jsonb, gateway_started_at timestamptz, PRIMARY KEY(owner_id,run_id,action_id),
 FOREIGN KEY(owner_id,run_id) REFERENCES omni_chat.agent_runs(owner_id,run_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS omni_chat.agent_reconciliations (
 owner_id uuid NOT NULL,run_id uuid NOT NULL,receipt_id uuid NOT NULL,
 operator_id text NOT NULL,external_receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,run_id,receipt_id),
 FOREIGN KEY(owner_id,run_id) REFERENCES omni_chat.agent_runs(owner_id,run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_runs_recovery_idx ON omni_chat.agent_runs(status,lease_until);
REVOKE ALL ON omni_chat.agent_runs,omni_chat.agent_steps,omni_chat.agent_tool_receipts,omni_chat.agent_reconciliations FROM PUBLIC;
COMMIT;
-- Deployment must explicitly grant the Chat/Worker roles these tables and the agent_steps identity sequence.
