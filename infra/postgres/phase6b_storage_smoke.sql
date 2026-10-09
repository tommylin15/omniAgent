BEGIN;
SET ROLE omniagent_chat_app;
DO $$
DECLARE
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
BEGIN
  INSERT INTO omni_chat.owners(owner_id,issuer,subject) VALUES
    (a,'https://accounts.google.com','phase6b-smoke-a'),
    (b,'https://accounts.google.com','phase6b-smoke-b');
  INSERT INTO omni_chat.threads(owner_id,thread_id,runtime,model,assistant_profile,create_key,create_digest)
    VALUES (a,'phase6b-smoke','gemini','gemini-2.5-flash','default','phase6b-smoke','sha256:' || repeat('a',64));
  BEGIN
    INSERT INTO omni_chat.turns(owner_id,thread_id,turn_id,message_key,message_digest)
      VALUES (b,'phase6b-smoke','foreign','foreign','sha256:' || repeat('b',64));
    RAISE EXCEPTION 'cross-owner turn unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  INSERT INTO omni_chat.turns(owner_id,thread_id,turn_id,message_key,message_digest)
    VALUES (a,'phase6b-smoke','turn-1','message-1','sha256:' || repeat('c',64));
  INSERT INTO omni_chat.events(owner_id,thread_id,turn_id,event_id,seq,event_type,payload)
    VALUES (a,'phase6b-smoke','turn-1','event-1',0,'text_delta','{"text":"ok"}');
  INSERT INTO omni_chat.skill_revisions(owner_id,skill_id,revision,content_digest,content,idempotency_key)
    VALUES (a,'probe',1,'sha256:' || repeat('d',64),'{"prompt":"ok"}','skill-1');
  INSERT INTO omni_chat.skill_state(owner_id,skill_id,current_revision)
    VALUES (a,'probe',1);
  RAISE NOTICE 'phase6b owner/thread/turn/event/skill storage and cross-owner FK passed';
END $$;
ROLLBACK;
