"""Protect active migration 007 schema, not retired one-shot workflow YAML."""
from pathlib import Path
import unittest

class R01MigrationSafety(unittest.TestCase):
    def test_budget_table_is_bounded_and_owner_scoped(self):
        ddl=Path('infra/postgres/migrations/007_chat_model_dispatch_budget.sql').read_text()
        self.assertIn('CREATE TABLE IF NOT EXISTS omni_chat.model_daily_budgets',ddl)
        self.assertIn('PRIMARY KEY(scope,owner_id,utc_day)',ddl)
        self.assertIn("CHECK(scope IN ('global','owner'))",ddl)
        self.assertIn('CHECK(attempts>=0)',ddl)
        self.assertIn('CHECK(reserved_tokens>=0)',ddl)
        for unsafe in ('DROP TABLE','TRUNCATE','ALTER ROLE','CREATE USER'):
            self.assertNotIn(unsafe,ddl)

if __name__=='__main__': unittest.main()
