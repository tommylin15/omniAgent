import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
SH=ROOT/"infra/gcp/p0-owner-identity-preflight.sh"
WF=ROOT/".github/workflows/omniagent-p0-owner-identity-preflight.yml"
class OwnerIdentityPreflight(unittest.TestCase):
    def test_read_only_uuid_provenance(self):
        sh=SH.read_text()
        self.assertIn("bd46f8f29ba78faaa606f03d6a760c1726ce27a7cd75381d5c04b9525861f70f",sh)
        self.assertNotIn("8b330f02-639d-4284-9e79-b2f183f74d06",sh)
        self.assertIn("omniagent_chat",sh)
        self.assertIn("omni_chat.owners",sh)
        self.assertIn("owner_identity=PASS_DB_BACKED_OAUTH_OWNER",sh)
        self.assertIn("gcloud secrets get-iam-policy",sh)
        self.assertIn("roles/secretmanager.secretAccessor",sh)
        self.assertNotIn("gcloud secrets add-iam-policy-binding",sh)
        self.assertNotIn("gcloud secrets add-iam-policy-binding",sh)
        for forbidden in ("INSERT INTO","UPDATE omni_chat","CREATE ROLE","add-iam-policy-binding",
                          "gcloud run deploy", "gcloud secrets versions access", ":access","gcloud secrets versions destroy"):
            self.assertNotIn(forbidden,sh)
if __name__=="__main__":
    unittest.main()
