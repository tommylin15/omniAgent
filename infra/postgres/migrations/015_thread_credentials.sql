-- Owner-bound metadata only. Keys never enter Chat storage.
BEGIN;
ALTER TABLE omni_chat.threads ADD COLUMN IF NOT EXISTS credential_profile_id uuid;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='threads_credential_owner_fk'
    AND conrelid='omni_chat.threads'::regclass) THEN
    ALTER TABLE omni_chat.threads ADD CONSTRAINT threads_credential_owner_fk
      FOREIGN KEY(owner_id,credential_profile_id) REFERENCES omni_chat.credential_profiles(owner_id,profile_id);
  END IF;
END $$;
COMMIT;
