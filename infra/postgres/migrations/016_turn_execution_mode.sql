BEGIN;
ALTER TABLE omni_chat.turns ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'chat'
  CHECK(execution_mode IN ('chat','agent'));
COMMIT;
