-- Run manually against the own Chat DB after read-only authorization.
-- Metrics only; no prompt/credential payloads and no retention changes.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT current_database() AS database_name;
SELECT relname,n_live_tup,n_dead_tup,pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables WHERE schemaname='omni_chat'
ORDER BY pg_total_relation_size(relid) DESC LIMIT 25;
SELECT state,count(*) AS objects,sum(byte_length) AS reserved_bytes
FROM omni_chat.artifacts GROUP BY state ORDER BY state;
SELECT kind,state,count(*) AS jobs FROM omni_chat.background_jobs GROUP BY kind,state ORDER BY kind,state;
COMMIT;
