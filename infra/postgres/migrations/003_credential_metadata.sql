-- FR-013 metadata only. Secret payloads NEVER enter PostgreSQL.
-- Migration must be idempotent and must not alter legacy schemas.
CREATE TABLE IF NOT EXISTS omni_chat.credential_profiles (
  owner_id uuid NOT NULL REFERENCES omni_chat.owners(owner_id),
  profile_id uuid NOT NULL,
  provider varchar(16) NOT NULL CHECK (provider IN ('gemini','openrouter')),
  credential_mode varchar(16) NOT NULL DEFAULT 'OWNER_BYOK' CHECK (credential_mode='OWNER_BYOK'),
  secret_version varchar(255) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REVOKING','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id,profile_id),
  UNIQUE (secret_version),
  CHECK (secret_version ~ '^projects/[a-z][a-z0-9-]+/secrets/omniagent-byok-[a-f0-9]{32}/versions/1$')
);
CREATE INDEX IF NOT EXISTS credential_profiles_owner_provider_idx
  ON omni_chat.credential_profiles(owner_id,provider,status);
