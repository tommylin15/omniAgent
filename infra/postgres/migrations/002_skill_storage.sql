-- New omniAgent-owned skill records. Never apply to Janus's private schema.
CREATE TABLE IF NOT EXISTS omni_chat.skill_revisions (
  owner_id uuid NOT NULL REFERENCES omni_chat.owners(owner_id),
  skill_id varchar(128) NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  content_digest char(71) NOT NULL CHECK (content_digest ~ '^sha256:[0-9a-f]{64}$'),
  content jsonb NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, skill_id, revision),
  UNIQUE (owner_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS omni_chat.skill_state (
  owner_id uuid NOT NULL REFERENCES omni_chat.owners(owner_id),
  skill_id varchar(128) NOT NULL,
  current_revision integer NOT NULL CHECK (current_revision > 0),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, skill_id),
  FOREIGN KEY (owner_id, skill_id, current_revision)
    REFERENCES omni_chat.skill_revisions(owner_id, skill_id, revision)
);

CREATE OR REPLACE FUNCTION omni_chat.reject_skill_revision_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'skill revisions are immutable';
END;
$$;

DROP TRIGGER IF EXISTS skill_revisions_immutable ON omni_chat.skill_revisions;
CREATE TRIGGER skill_revisions_immutable BEFORE UPDATE OR DELETE ON omni_chat.skill_revisions
FOR EACH ROW EXECUTE FUNCTION omni_chat.reject_skill_revision_change();
