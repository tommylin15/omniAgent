from pathlib import Path
import ast, unittest
class R01OneRealAttempt(unittest.TestCase):
 def test_r01_is_single_bounded_provider_call_with_own_db(self):
  p=Path('scripts/r01_live_once.py').read_text()
  ast.parse(p)
  self.assertEqual(p.count('"/internal/v1/chat/dispatch:once"'),1)
  for t in ['"chat_dispatch_http_attempts"','"UNKNOWN_NO_RETRY"','"db_receipt"','"source_sha"','"PARTIAL_UNVERIFIED"']:
   self.assertIn(t,p)
  remote=Path('infra/gcp/r01-live-once-db.sh').read_text()
  for t in ['db=omniagent_chat','SET LOCAL ROLE omniagent_chat_app','ALREADY_ATTEMPTED_NO_RETRY','r01_fixture=CREATED_ONCE','model_daily_budgets']:
   self.assertIn(t,remote)
  for bad in ['DROP TABLE','TRUNCATE','ALTER ROLE','gcloud run deploy','gcloud secrets versions access']:
   self.assertNotIn(bad,remote)
  workflow=Path('.github/workflows/omniagent-r01-verified-tls-canary.yml').read_text()
  self.assertIn('[r01-real-once]',workflow)
  self.assertIn('scripts/r01_live_once.py',workflow)
  self.assertIn('r01_tls_and_chat_budget_ready=PASS_WITH_VERIFIED_CA',workflow)
  self.assertLess(workflow.index('r01_tls_and_chat_budget_ready=PASS_WITH_VERIFIED_CA'),
                  workflow.index('python3 scripts/r01_live_once.py'))
if __name__=='__main__':unittest.main()
