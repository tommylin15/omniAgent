SELECT current_database() = 'omniagent_chat' AS correct_database;
SELECT current_user = 'omniagent_chat_app' AS correct_role;
SELECT to_regnamespace('omni_chat') IS NOT NULL AS schema_ready;
SELECT count(*) = 7 AS expected_table_count
FROM pg_tables
WHERE schemaname = 'omni_chat';
