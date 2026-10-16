"""Guard the Owner's automation-only OAuth policy during GHCR release.

CI does not manufacture a human Google ID token. This verifies actual negative
authentication and boundary tests remain present in the exact release source.
"""
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
class AutomatedOauthGate(unittest.TestCase):
    def test_google_token_verification_remains_enforced(self):
        src=(ROOT/"services/chat-api/main.ts").read_text()
        for value in ("google.verifyIdToken", "payload?.sub", "payload.iss",
                      '"https://accounts.google.com"', "audience",
                      "claims.email_verified !== true"):
            self.assertIn(value,src)
        self.assertIn('if (process.env.CHAT_DISPATCH_ENABLED === "true")',src)
        self.assertIn('verifyGoogleBrowserUserClaims(claims)',src)
        guard=(ROOT/"services/chat-api/google_user_identity.ts").read_text()
        self.assertIn("gserviceaccount",guard)
        self.assertIn("email_verified",guard)

    def test_negative_coverage_remains_in_exact_sha_ci(self):
        wf=(ROOT/".github/workflows/omniagent-ghcr-publish.yml").read_text()
        smoke=(ROOT/".github/workflows/omniagent-ghcr-current-candidate-smoke.yml").read_text()
        api=(ROOT/"tests/chat_api.test.ts").read_text()
        pg=(ROOT/"tests/chat_storage.acceptance.test.ts").read_text()
        self.assertIn("npm test",wf)
        self.assertIn("tests/chat_storage.acceptance.test.ts",wf)
        self.assertIn("http=$actual",smoke)
        self.assertIn("anonymous_chat_api_denied_http=",smoke)
        self.assertIn("anonymous_chat_dispatch_denied_http=",smoke)
        self.assertIn("anonymous_private_health=",smoke)
        self.assertIn('automated_oauth_owner_negative=NOT_VERIFIED_BY_THIS_SMOKE',smoke)
        self.assertIn("denies an authenticated but model-unentitled owner",api)
        self.assertIn("cross-owner request",pg)

    def test_no_fake_manual_oauth_success_or_implicit_model_enablement(self):
        policy=(ROOT/"docs/oauth-automated-acceptance-policy.md").read_text()
        release=(ROOT/".github/workflows/omniagent-ghcr-one-shot-release.yml").read_text()
        self.assertIn("NOT_REQUIRED",policy)
        self.assertIn("NOT_VERIFIED_AUTOMATION_UNAVAILABLE",policy)
        self.assertIn("DEPLOY_CODE_WITH_DISPATCH_AND_BYOK_DISABLED",release)
        self.assertIn("[release-once]",release)
        self.assertNotIn("  workflow_dispatch:",release)

if __name__=="__main__":unittest.main()
