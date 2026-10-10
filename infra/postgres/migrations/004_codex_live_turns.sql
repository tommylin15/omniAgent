-- Owner-bound, short-lived Codex live turn control references. No tokens,
-- prompts, provider credentials or native handles are returned to browsers.
CREATE TABLE IF NOT EXISTS omni_chat.codex_turn_sessions (
 owner_id uuid NOT NULL,
 thread_id varchar(128) NOT NULL,
 turn_id varchar(128) NOT NULL,
 turn_handle varchar(128) NOT NULL,
 native_thread_id varchar(128) NOT NULL,
 native_turn_id varchar(128) NOT NULL,
 native_cursor bigint NOT NULL DEFAULT -1 CHECK (native_cursor >= -1),
 phase varchar(16) NOT NULL DEFAULT 'IDLE'
   CHECK (phase IN ('IDLE','POLLING','RESOLVING','CANCELLING')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,thread_id,turn_id),
 FOREIGN KEY(owner_id,thread_id,turn_id)
   REFERENCES omni_chat.turns(owner_id,thread_id,turn_id) ON DELETE CASCADE
);
-- RESOLVING means a native approval RPC may already have been submitted.
-- Never retry a RESOLVING approval automatically after a network error.
DO $$ BEGIN
  ALTER TABLE omni_chat.approvals DROP CONSTRAINT IF EXISTS approvals_status_check;
  ALTER TABLE omni_chat.approvals ADD CONSTRAINT approvals_status_check
    CHECK (status IN ('PENDING','RESOLVING','APPROVED','DENIED','EXPIRED'));
END $$;
