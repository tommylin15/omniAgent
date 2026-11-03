BEGIN;
ALTER TABLE omni_chat.threads ADD COLUMN IF NOT EXISTS route_profile text NOT NULL DEFAULT 'public-lite'
  CHECK(route_profile IN ('public-lite','private-lite','advanced-flash'));
COMMIT;
