import ast
from pathlib import Path
import unittest
class R01TLSCanarySafety(unittest.TestCase):
    def test_read_only_source_guard_and_restoration(self):
        source=Path("scripts/r01_tls_canary.py").read_text()
        ast.parse(source)
        for x in ("OWNER_DIGEST","verified-ca","CHAT_DATABASE_CA_BASE64",
                  "CHAT_INTERNAL_ALLOWED_EMAILS","existing_callers",
                  "restore(chat,image","production_traffic_modified","ZERO_TRAFFIC"):
            self.assertIn(x,source)
        w=Path(".github/workflows/omniagent-r01-verified-tls-canary.yml").read_text()
        for x in ("[r01-tls-canary-once]","r01_chat_private_gateway_service_iam=PASS",
                  "r01_tls_and_chat_budget_ready=PASS_WITH_VERIFIED_CA",
                  "r01_owner_live_provider_call=NOT_PERFORMED"):
            self.assertIn(x,w)
        self.assertIn("openssl x509 -inform PEM -outform PEM",w)
        self.assertIn("r01_auth_preflight.py",w)
        self.assertLess(w.index("r01_auth_preflight.py"),w.index("r01_live_once.py"))
        self.assertIn("dict.fromkeys(caller_set+[machine_caller,codex_caller])",source)
if __name__=="__main__":unittest.main()
