-- New omniAgent-owned schema. Do not apply this to the Janus migration ledger.
CREATE SCHEMA IF NOT EXISTS omni_chat;

CREATE TABLE IF NOT EXISTS omni_chat.owners (
  owner_id uuid PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  legacy_janus_user_id uuid UNIQUE,
  mapping_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject),
  CHECK ((legacy_janus_user_id IS NULL) = (mapping_verified_at IS NULL))
);

CREATE TABLE IF NOT EXISTS omni_chat.threads (
  owner_id uuid NOT NULL REFERENCES omni_chat.owners(owner_id),
  thread_id varchar(128) NOT NULL,
  runtime varchar(16) NOT NULL CHECK (runtime IN ('openrouter', 'gemini', 'codex')),
  model varchar(128) NOT NULL,
  assistant_profile varchar(128) NOT NULL,
  skill_profile varchar(128),
  parent_thread_id varchar(128),
  create_key varchar(128) NOT NULL,
  create_digest char(71) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, thread_id),
  UNIQUE (owner_id, create_key),
  FOREIGN KEY (owner_id, parent_thread_id) REFERENCES omni_chat.threads(owner_id, thread_id)
);

CREATE TABLE IF NOT EXISTS omni_chat.turns (
  owner_id uuid NOT NULL,
  thread_id varchar(128) NOT NULL,
  turn_id varchar(128) NOT NULL,
  message_key varchar(128) NOT NULL,
  message_digest char(71) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'ERROR')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (owner_id, thread_id, turn_id),
  UNIQUE (owner_id, thread_id, message_key),
  FOREIGN KEY (owner_id, thread_id) REFERENCES omni_chat.threads(owner_id, thread_id)
);

CREATE TABLE IF NOT EXISTS omni_chat.events (
  owner_id uuid NOT NULL,
  thread_id varchar(128) NOT NULL,
  turn_id varchar(128) NOT NULL,
  event_id varchar(128) NOT NULL,
  seq bigint NOT NULL CHECK (seq >= 0),
  event_type varchar(32) NOT NULL CHECK (event_type IN ('text_delta','item_upsert','tool_request','tool_result','approval_request','approval_resolved','citation','usage','turn_completed','turn_cancelled','turn_error')),
  payload jsonb NOT NULL,
  item_id varchar(128),
  provider_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, thread_id, event_id),
  UNIQUE (owner_id, thread_id, seq),
  FOREIGN KEY (owner_id, thread_id, turn_id) REFERENCES omni_chat.turns(owner_id, thread_id, turn_id)
);

CREATE TABLE IF NOT EXISTS omni_chat.approvals (
  owner_id uuid NOT NULL,
  thread_id varchar(128) NOT NULL,
  turn_id varchar(128) NOT NULL,
  request_id varchar(128) NOT NULL,
  operation varchar(16) NOT NULL CHECK (operation IN ('shell', 'write_file')),
  scope varchar(16) NOT NULL DEFAULT 'turn_sandbox' CHECK (scope = 'turn_sandbox'),
  params_digest char(71) NOT NULL CHECK (params_digest ~ '^sha256:[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DENIED','EXPIRED')),
  resolved_at timestamptz,
  PRIMARY KEY (owner_id, thread_id, turn_id, request_id),
  FOREIGN KEY (owner_id, thread_id, turn_id) REFERENCES omni_chat.turns(owner_id, thread_id, turn_id)
);

CREATE INDEX IF NOT EXISTS threads_owner_updated_idx ON omni_chat.threads(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS events_owner_thread_seq_idx ON omni_chat.events(owner_id, thread_id, seq);
