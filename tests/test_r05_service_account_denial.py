import ast
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

source = Path("scripts/r05_service_account_denial.py")
spec = importlib.util.spec_from_file_location("r05_service_account_denial",source)
import sys
sys.path.insert(0,str(source.parent.resolve()))
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)

class R05SignedServicePrincipalGate(unittest.TestCase):
    def test_safe_positive_fixture_denies_real_iam_principal(self):
        seen=[]
        def call(url,headers=None):
            seen.append((url,headers.get("Authorization","")))
            return 401
        with patch.object(script,"print"):
            script.deny("https://candidate.a.run.app", "scoped.jwt.fixture", call)
        self.assertEqual(len(seen),5)
        self.assertTrue(all(x[1]=="Bearer scoped.jwt.fixture" for x in seen))
        self.assertTrue(all("/v1/" in x[0] for x in seen))
    def test_one_auth_bypass_is_not_pass(self):
        with patch.object(script,"print"):
            with self.assertRaisesRegex(RuntimeError,"accessed user endpoint"):
                script.deny("https://candidate.a.run.app", "fixture", lambda *a,**k: 200)
    def test_static_safety(self):
        data=source.read_text()
        ast.parse(data)
        for term in ("iamcredentials.googleapis.com","generateIdToken",
                     "email_verified","getOpenIdToken","PASS_401",
                     "r05_real_two_google_users=NOT_VERIFIED",
                     "omniagent-codex-chat-client","omniagent-chat"):
            if term=="omniagent-chat":
                self.assertIn("r05_live_auth_negative",data)
            else:
                self.assertIn(term,data)
        for unsafe in ('"/messages"','/internal/v1/chat/dispatch:once',
                       'gcloud run deploy','gcloud secrets versions','print(token',
                       "includeEmail\": False"):
            self.assertNotIn(unsafe,data)
        wf=Path(".github/workflows/omniagent-r05-live-negative.yml").read_text()
        self.assertIn("scripts/r05_service_account_denial.py",wf)
        self.assertIn("r05_signed_sa_user_boundary=PASS",wf)
        self.assertIn("r05_no_model_inference=PASS",wf)

if __name__=="__main__":
    unittest.main()
