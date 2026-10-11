-- Independent hard upper bound for one explicitly approved Owner's
-- Codex trial. This migration grants NO owner any execution allowance.
-- The verified Owner must be enrolled separately by a bounded operator
-- transaction after positive permission and Secret Manager verification.
CREATE TABLE IF NOT EXISTS omni_chat.codex_trial_budgets (
  owner_id uuid PRIMARY KEY REFERENCES omni_chat.owners(owner_id),
  max_turns smallint NOT NULL DEFAULT 3 CHECK (max_turns = 3),
  consumed_turns smallint NOT NULL DEFAULT 0
    CHECK (consumed_turns >= 0 AND consumed_turns <= max_turns),
  approved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > approved_at AND
         expires_at <= approved_at + interval '24 hours')
);
-- The counter is transactionally incremented BEFORE the QUEUED turn is
-- claimed as RUNNING, hence a failed or uncertain turn still costs one
-- allowance. Never reset consumed_turns on cancellation, retry or deletion.
