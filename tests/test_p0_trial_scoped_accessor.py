import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
SH=ROOT/"infra/gcp/p0-trial-scoped-secret-accessor.sh"
WF=ROOT/".github/workflows/omniagent-p0-trial-scoped-accessor.yml"
class ScopedAccessorTest(unittest.TestCase):
  def test_single_secret_single_runtime_sa_no_payload(self):
    s=SH.read_text()
    for x in ("SECRET='omniagent-shared-codex-auth'",
              "GATEWAY='omniagent-gateway@gen-lang-client-0593591102.iam.gserviceaccount.com'",
              "ROLE='roles/secretmanager.secretAccessor'",
              "trial_secret_accessor=PASS_SCOPED_READONLY"):
      self.assertIn(x,s)
    for bad in ("roles/secretmanager.admin","roles/secretmanager.secretVersionManager",
                "gcloud projects add-iam-policy-binding","gcloud secrets versions access",
                ":access","gcloud secrets versions destroy","gcloud secrets versions add",
                "gcloud run update-traffic","CODEX_OWNER_SECRETS"):
      self.assertNotIn(bad,s)
  def test_wif(self):
    self.assertIn("id-token: write",WF.read_text())
    self.assertIn("if: github.repository",WF.read_text())
if __name__=="__main__":
  unittest.main()
