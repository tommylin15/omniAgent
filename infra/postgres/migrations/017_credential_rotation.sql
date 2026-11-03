BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('omniagent_chat','omniagent_acceptance') OR to_regclass('omni_chat.credential_profiles') IS NULL THEN
  RAISE EXCEPTION 'wrong database/schema for credential rotation';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS omni_chat.credential_rotations (
 owner_id uuid NOT NULL,operation_id uuid NOT NULL,operation_key uuid NOT NULL,profile_id uuid NOT NULL,
 resource_id uuid NOT NULL,old_reference text NOT NULL,new_reference text NOT NULL,key_sha256 char(64) NOT NULL,
 status text NOT NULL CHECK(status IN ('RESERVED','PROVISIONING','VERIFIED','CLEANUP','COMPLETED','UNKNOWN','ROLLBACK','ROLLED_BACK')),
 fence bigint NOT NULL DEFAULT 0,lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,operation_id),UNIQUE(owner_id,operation_key),
 FOREIGN KEY(owner_id,profile_id) REFERENCES omni_chat.credential_profiles(owner_id,profile_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS credential_one_active_rotation ON omni_chat.credential_rotations(owner_id,profile_id)
 WHERE status NOT IN ('COMPLETED','ROLLED_BACK');
REVOKE ALL ON omni_chat.credential_rotations FROM PUBLIC;
COMMIT;
