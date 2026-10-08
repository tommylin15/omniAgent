"""Bounded acceptance auth: scoped OIDC issuer never requests access-token impersonation."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "infra/gcp"))
import live_acceptance_v2 as v2  # noqa: E402


class OidcIdentitySafety(unittest.TestCase):
    def test_issues_id_token_with_scoped_iam_api(self):
        audience = "https://omniagent-agent-gateway-example.run.app"
        email = "omniagent-chat@example.iam.gserviceaccount.com"
        with patch.object(v2, "gcloud", return_value="synthetic-ci-access-token") as sdk, \
                patch.object(v2.urllib.request, "urlopen") as http:
            http.return_value.__enter__.return_value.read.return_value = json.dumps(
                {"token": "synthetic-oidc-id-token"}).encode()
            self.assertEqual(v2.identity(email, audience), "synthetic-oidc-id-token")
        sdk.assert_called_once_with("auth", "print-access-token")
        request = http.call_args.args[0]
        self.assertIn("iamcredentials.googleapis.com", request.full_url)
        self.assertIn(":generateIdToken", request.full_url)
        self.assertIn("omniagent-chat%40example.iam.gserviceaccount.com", request.full_url)
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(json.loads(request.data), {"audience": audience, "includeEmail": True})
        self.assertEqual(request.get_header("Authorization"), "Bearer synthetic-ci-access-token")
        self.assertEqual(http.call_args.kwargs["timeout"], 20)

    def test_web_oauth_audience_retains_existing_approved_client_sa_path(self):
        email = "omniagent-codex-chat-client@example.iam.gserviceaccount.com"
        audience = "123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com"
        with patch.object(v2, "gcloud", return_value="synthetic-web-id-token") as sdk, \
                patch.object(v2.urllib.request, "urlopen") as http:
            self.assertEqual(v2.identity(email, audience), "synthetic-web-id-token")
        sdk.assert_called_once_with("auth", "print-identity-token",
            "--impersonate-service-account=" + email,
            "--audiences=" + audience, "--include-email")
        http.assert_not_called()

    def test_refuses_missing_token_and_reports_no_sensitive_error(self):
        with patch.object(v2, "gcloud", return_value="synthetic") as sdk, \
                patch.object(v2.urllib.request, "urlopen") as http:
            http.return_value.__enter__.return_value.read.return_value = b"{}"
            with self.assertRaisesRegex(RuntimeError, "^ID_TOKEN_ISSUANCE_FAILED$"):
                v2.identity("omniagent-chat@example.iam.gserviceaccount.com", "https://example.org")
            sdk.assert_called_once_with("auth", "print-access-token")

    def test_requires_https_audience_before_credentials(self):
        with patch.object(v2, "gcloud") as sdk:
            for audience in ("http://example.org", "", "not-a-url",
                             "malicious.apps.googleusercontent.com"):
                with self.assertRaisesRegex(RuntimeError, "invalid identity"):
                    v2.identity("omniagent-chat@example.iam.gserviceaccount.com", audience)
            sdk.assert_not_called()

    def test_http_errors_do_not_leak_provider_details(self):
        import urllib.error
        error = urllib.error.HTTPError("https://iamcredentials.googleapis.com", 403,
            "credential details must stay private", {}, io.BytesIO(b"private token"))
        with patch.object(v2, "gcloud", return_value="synthetic"), \
                patch.object(v2.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "^ID_TOKEN_ISSUANCE_FAILED$"):
                v2.identity("omniagent-chat@example.iam.gserviceaccount.com", "https://example.org")


if __name__ == "__main__":
    unittest.main()
