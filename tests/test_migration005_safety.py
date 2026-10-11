import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"infra/gcp/apply-omniagent-chat-migration005.sh"
WF=ROOT/".github/workflows/omniagent-p0-postgres-migration005.yml"
class CodexTrialMigrationSafety(unittest.TestCase):
    def test_restrict_database_and_permissions(self):
        src=SCRIPT.read_text()
        for name in ("db=omniagent_chat","role=omniagent_chat_app",
                     "SET ROLE omniagent_chat_app","codex_trial_budgets",
                     "consumed_turns","max_turns","expires_at","--single-transaction"):
            self.assertIn(name,src)
        for forbidden in ("DROP DATABASE","CREATE DATABASE","ALTER ROLE ","gcloud run deploy",
                          "CHAT_DISPATCH_ENABLED=true","CODEX_OWNER_SECRETS"):
            self.assertNotIn(forbidden,src)
    def test_workflow_readback_not_inference(self):
        src=WF.read_text()
        self.assertIn("id-token: write",src)
        self.assertIn("if: always()",src)
        self.assertIn("apply-omniagent-chat-migration005.sh",src)
        self.assertNotIn("CHAT_DISPATCH_ENABLED=true",src)
if __name__=="__main__":
    unittest.main()
