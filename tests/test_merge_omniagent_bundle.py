"""Safe offline tests for the one-secret operator merge utility."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("merge_bundle", Path(__file__).parents[1] / "infra/gcp/merge-omniagent-bundle.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

DSN = "postgresql://omniagent_chat_app:fake@10.0.1.2:5432/omniagent_chat?sslmode=require"


class MergeBundle(unittest.TestCase):
    def test_preserves_provider_keys_and_adds_db_and_random_signing(self):
        old = {"gemini_api_key": "gemini-fake", "openrouter_api_key": "router-fake", "legacy": "keep"}
        merged = module.merge(old, DSN)
        self.assertEqual(merged["gemini_api_key"], old["gemini_api_key"])
        self.assertEqual(merged["openrouter_api_key"], old["openrouter_api_key"])
        self.assertEqual(merged["legacy"], "keep")
        self.assertEqual(merged["chat_database_url"], DSN)
        self.assertRegex(merged["mcp_owner_signing_key"], r"^[0-9a-f]{64}$")
        self.assertNotIn("mcp_owner_signing_key", old)

    def test_never_rotates_existing_valid_signing_key(self):
        result = module.merge({"gemini_api_key": "a", "openrouter_api_key": "b",
                               "mcp_owner_signing_key": "x" * 64}, DSN)
        self.assertEqual(result["mcp_owner_signing_key"], "x" * 64)

    def test_invalid_database_or_existing_keys_are_rejected(self):
        base = {"gemini_api_key": "a", "openrouter_api_key": "b"}
        for dsn in ("bogus", "postgresql://user:pw@10.0.0.1/omniagent_chat?sslmode=require",
                    "postgresql://omniagent_chat_app:pw@8.8.8.8/omniagent_chat?sslmode=require",
                    "postgresql://omniagent_chat_app:pw@10.0.1.2/omniagent_chat"):
            with self.assertRaises(ValueError):
                module.merge(base, dsn)
        with self.assertRaises(ValueError):
            module.merge({"gemini_api_key": ""}, DSN)


if __name__ == "__main__":
    unittest.main()
