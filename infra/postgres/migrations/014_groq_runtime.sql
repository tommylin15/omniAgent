-- Additive runtime support. Provider execution remains separately gated OFF.
BEGIN;
ALTER TABLE omni_chat.threads DROP CONSTRAINT IF EXISTS threads_runtime_check;
ALTER TABLE omni_chat.threads ADD CONSTRAINT threads_runtime_check
  CHECK (runtime IN ('openrouter','gemini','groq','codex'));
ALTER TABLE omni_chat.credential_profiles DROP CONSTRAINT IF EXISTS credential_profiles_provider_check;
ALTER TABLE omni_chat.credential_profiles ADD CONSTRAINT credential_profiles_provider_check
  CHECK(provider IN ('gemini','openrouter','groq'));
COMMIT;
