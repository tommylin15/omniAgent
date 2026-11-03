BEGIN;
DO $$ BEGIN
  IF current_database() NOT IN ('omniagent_chat','omniagent_acceptance') OR to_regnamespace('omni_chat') IS NULL THEN
    RAISE EXCEPTION 'wrong database/schema for omniagent message intents';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS omni_chat.message_intents (
  owner_id uuid NOT NULL,thread_id varchar(128) NOT NULL,idempotency_key uuid NOT NULL,
  content_digest char(64) NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK(state IN ('prepared','consumed','cancelled')),
  turn_id varchar(128),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,thread_id,idempotency_key),
  FOREIGN KEY(owner_id,thread_id) REFERENCES omni_chat.threads(owner_id,thread_id) ON DELETE CASCADE,
  CHECK((state='consumed' AND turn_id IS NOT NULL) OR (state IN ('prepared','cancelled') AND turn_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_prepared_message_intent ON omni_chat.message_intents(owner_id,thread_id) WHERE state='prepared';
CREATE INDEX IF NOT EXISTS latest_message_intent ON omni_chat.message_intents(owner_id,thread_id,updated_at DESC);
REVOKE ALL ON omni_chat.message_intents FROM PUBLIC;
COMMIT;
-- Keep cancelled receipts while their thread exists: a late POST must never revive them.
