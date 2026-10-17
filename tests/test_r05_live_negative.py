from pathlib import Path
import ast
import unittest

class R05LiveNegativeSafety(unittest.TestCase):
    def test_invalid_token_only_current_candidate(self):
        path = Path("scripts/r05_live_auth_negative.py")
        source = path.read_text()
        ast.parse(source)
        for required in ("ghcr-", "percent", "PASS_401",
                         "invalid.jwt.payload", "X-OmniAgent-Owner-Id",
                         "r05_valid_two_user_oauth_e2e=NOT_VERIFIED",
                         "r05_model_provider_calls=ZERO",
                         "r05_formal_traffic_unchanged=PASS"):
            self.assertIn(required, source)
        for forbidden in ("generateIdToken", "iamcredentials.googleapis.com",
                          "gcloud run deploy", "gcloud secrets versions",
                          "/internal/v1/chat/dispatch:once",
                          "/internal/v1/assistant/turn"):
            self.assertNotIn(forbidden, source)
if __name__ == "__main__":
    unittest.main()
