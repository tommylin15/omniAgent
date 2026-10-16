from pathlib import Path
import unittest

class R05OwnerInventoryGuard(unittest.TestCase):
    def test_live_inventory_scoped_and_not_e2e(self):
        s=Path("infra/gcp/r05-owner-inventory-readonly.sh").read_text()
        for word in ("BEGIN TRANSACTION READ ONLY", "SET LOCAL ROLE omniagent_chat_app",
                     "db='omniagent_chat'","r05_two_user_oauth_api_e2e=NOT_VERIFIED",
                     "r05_db_read_only=PASS_OWN_LOGICAL_DATABASE"):
            self.assertIn(word,s)
        for bad in ("INSERT INTO", "UPDATE omni_chat", "DELETE FROM omni_chat",
                    "CREATE TABLE","gcloud run deploy","gcloud secrets versions access"):
            self.assertNotIn(bad,s)
        w=Path(".github/workflows/omniagent-r05-owner-inventory.yml").read_text()
        self.assertIn("r05-owner-inventory-readonly.sh",w)
        self.assertNotIn("workflow_dispatch",w)
        self.assertNotIn("CHAT_DISPATCH_ENABLED",w)

if __name__=="__main__":
    unittest.main()
