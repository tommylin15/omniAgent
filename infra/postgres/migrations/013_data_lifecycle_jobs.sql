-- Application roles need explicit grants after review; no hot-data deletion policy.
BEGIN;
DO $$ BEGIN
  IF current_database() NOT IN ('omniagent_chat','omniagent_acceptance') OR to_regnamespace('omni_chat') IS NULL THEN
    RAISE EXCEPTION 'wrong database/schema for data lifecycle';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS omni_chat.artifacts (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, idempotency_key text NOT NULL,
  object_key text NOT NULL UNIQUE, sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length BETWEEN 0 AND 16777216), content_type text NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','uploading','available','uncertain','rejected')),
  generation text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS omni_chat.archive_exports (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, idempotency_key text NOT NULL,
  artifact_id uuid NOT NULL REFERENCES omni_chat.artifacts(id), sha256 text NOT NULL, table_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','uncertain','verified')),
  snapshot_receipt jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS omni_chat.background_jobs (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, kind text NOT NULL, idempotency_key text NOT NULL,
  payload jsonb NOT NULL, result jsonb, state text NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled')),
  available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
  attempts integer NOT NULL DEFAULT 0, cancel_requested boolean NOT NULL DEFAULT false, duration_ms bigint,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS background_jobs_claim ON omni_chat.background_jobs(available_at) WHERE state IN ('queued','running');
CREATE TABLE IF NOT EXISTS omni_chat.job_schedules (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, kind text NOT NULL, payload jsonb NOT NULL,
  idempotency_key text NOT NULL,request_digest char(64) NOT NULL, UNIQUE(owner_id,idempotency_key),
  interval_seconds integer NOT NULL CHECK(interval_seconds BETWEEN 3600 AND 2678400),
  next_run_at timestamptz NOT NULL, enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS omni_chat.job_notifications (
  job_id uuid PRIMARY KEY REFERENCES omni_chat.background_jobs(id), owner_id uuid NOT NULL,
  state text NOT NULL CHECK(state IN ('succeeded','failed','cancelled')), result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
);
CREATE TABLE IF NOT EXISTS omni_chat.analytics_queries (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, remote_job_id text NOT NULL UNIQUE,
  location text NOT NULL, project_id text NOT NULL, idempotency_key text NOT NULL, request_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS omni_chat.workflow_checkpoints (
  owner_id uuid NOT NULL, workflow_key text NOT NULL, job_id uuid NOT NULL, digest text NOT NULL, report jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,workflow_key)
);
CREATE TABLE IF NOT EXISTS omni_chat.iceberg_writer_exports (
  export_id uuid PRIMARY KEY, owner_id uuid NOT NULL, source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  table_name text NOT NULL, content_type text NOT NULL,
  state text NOT NULL CHECK(state IN ('prepared','uncertain','verified')), snapshot_receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON omni_chat.artifacts, omni_chat.archive_exports, omni_chat.background_jobs,
  omni_chat.job_schedules, omni_chat.job_notifications, omni_chat.analytics_queries, omni_chat.workflow_checkpoints, omni_chat.iceberg_writer_exports FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='omniagent_jobs_app') THEN
    CREATE ROLE omniagent_jobs_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='omniagent_jobs_app' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'unexpected privileges on omniagent_jobs_app';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='omniagent_iceberg_writer') THEN
    CREATE ROLE omniagent_iceberg_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='omniagent_iceberg_writer' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'unexpected privileges on omniagent_iceberg_writer';
  END IF;
END $$;
GRANT USAGE ON SCHEMA omni_chat TO omniagent_iceberg_writer;
GRANT SELECT,INSERT,UPDATE ON omni_chat.iceberg_writer_exports TO omniagent_iceberg_writer;
GRANT USAGE ON SCHEMA omni_chat TO omniagent_jobs_app;
GRANT SELECT,INSERT,UPDATE ON omni_chat.artifacts, omni_chat.archive_exports, omni_chat.background_jobs,
  omni_chat.job_schedules, omni_chat.job_notifications, omni_chat.analytics_queries, omni_chat.workflow_checkpoints TO omniagent_jobs_app;
-- An operator must explicitly grant this group to the approved Chat/worker login roles.
COMMIT;
