from pathlib import Path
import ast, unittest
class R01OneRealAttempt(unittest.TestCase):
 def test_r01_is_single_bounded_provider_call_with_own_db(self):
  p=Path('scripts/r01_live_once.py').read_text()
  ast.parse(p)
  self.assertEqual(p.count('"/internal/v1/chat/dispatch:once"'),1)
  self.assertIn("candidate_allowed != (allowed | set(approved))",p)
  self.assertIn("choose_approved_token(callers,audience)",p)
  self.assertIn('result["provider_usage_readback"]=="PRESENT" and',p)
  for t in ['"chat_dispatch_http_attempts"','"UNKNOWN_NO_RETRY"','"db_receipt"','"source_sha"','"PARTIAL_UNVERIFIED"']:
   self.assertIn(t,p)
  remote=Path('infra/gcp/r01-live-once-db.sh').read_text()
  for t in ['db=omniagent_chat','SET LOCAL ROLE omniagent_chat_app','ALREADY_ATTEMPTED_NO_RETRY','r01_fixture=CREATED_ONCE','model_daily_budgets']:
   self.assertIn(t,remote)
  for bad in ['DROP TABLE','TRUNCATE','ALTER ROLE','gcloud run deploy','gcloud secrets versions access']:
   self.assertNotIn(bad,remote)
if __name__=='__main__':unittest.main()
