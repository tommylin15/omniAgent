from pathlib import Path
import unittest
class R01MigrationSafety(unittest.TestCase):
    def test_scoped_automatic_migration_guards(self):
        x=Path('.github/workflows/omniagent-r01-chat-db-migration007.yml').read_text()
        for s in ['[r01-migration007-once]','omniagent_chat','SET ROLE omniagent_chat_app;',
                  '007_chat_model_dispatch_budget.sql','--single-transaction',
                  'r01_migration007_table_owner=VERIFIED']:
            self.assertIn(s,x)
        for banned in ['gcloud projects add-iam','gcloud run deploy','gcloud secrets versions access','DROP DATABASE','TRUNCATE','ALTER ROLE']:
            self.assertNotIn(banned,x)
if __name__=='__main__': unittest.main()
