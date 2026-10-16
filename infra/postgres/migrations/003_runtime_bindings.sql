-- Native process handles are routing metadata, never authorization or credentials.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('omniAgent-runtime-bindings'));
ALTER TABLE omni_chat.approvals ADD COLUMN IF NOT EXISTS forward_attempted_at timestamptz;
CREATE TABLE IF NOT EXISTS omni_chat.runtime_bindings (
  owner_id uuid NOT NULL,
  thread_id varchar(128) NOT NULL,
  turn_id varchar(128) NOT NULL,
  context jsonb NOT NULL,
  cursor bigint NOT NULL DEFAULT -1 CHECK (cursor >= -1),
  operation_id uuid,
  operation_until timestamptz,
  PRIMARY KEY (owner_id,thread_id,turn_id),
  FOREIGN KEY (owner_id,thread_id,turn_id) REFERENCES omni_chat.turns(owner_id,thread_id,turn_id)
);
COMMIT;
