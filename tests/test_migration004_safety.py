import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "infra/gcp/apply-omniagent-chat-migration004.sh"
WF = ROOT / ".github/workflows/omniagent-p0-postgres-migration004.yml"

class Migration004Safety(unittest.TestCase):
    def test_database_only_contract(self):
        content = SCRIPT.read_text()
        for term in ("db=omniagent_chat", "role=omniagent_chat_app",
                     "SET ROLE omniagent_chat_app", "--single-transaction -d \"$db\"",
                     "BLOCKED_DATABASE_OWNER", "migration004=PASS"):
            self.assertIn(term,content)
        for illegal in ("DROP DATABASE", "CREATE DATABASE", "ALTER ROLE ",
                        "gcloud run deploy", "update-traffic"):
            self.assertNotIn(illegal,content)
    def test_workflow_requires_exact_main_and_wif(self):
        content=WF.read_text()
        self.assertIn("id-token: write",content)
        self.assertIn("apply-omniagent-chat-migration004.sh",content)
        self.assertIn("if: always()",content)
        self.assertNotIn("CHAT_DISPATCH_ENABLED=true",content)
if __name__ == "__main__":
    unittest.main()
