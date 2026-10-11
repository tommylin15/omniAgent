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
        self.assertNotIn("gcloud secrets add-iam-policy-binding",sh)
        for forbidden in ("INSERT INTO","UPDATE omni_chat","CREATE ROLE","secretAccessor","add-iam-policy-binding",
                          "gcloud run deploy", "gcloud secrets versions access", ":access","gcloud secrets versions destroy"):
            self.assertNotIn(forbidden,sh)
    def test_github_wif_exact_sha(self):
        sh=SH.read_text(); wf=WF.read_text()
        self.assertIn('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',sh)
        self.assertIn('id-token: write',wf)
        self.assertNotIn('CHAT_DISPATCH_ENABLED=true',wf)
if __name__=="__main__":
    unittest.main()
