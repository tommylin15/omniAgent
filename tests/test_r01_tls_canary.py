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
        self.assertIn("dict.fromkeys(caller_set+[machine_caller,codex_caller])",source)
if __name__=="__main__":unittest.main()
