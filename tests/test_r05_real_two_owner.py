import unittest
from unittest.mock import patch
import importlib.util
from pathlib import Path

path = Path("scripts/r05_real_two_owner.py")
spec = importlib.util.spec_from_file_location("r05_real_two_owner", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FakeHttp:
    def __init__(self, cross_leak=False, cleanup_failure=False):
        self.owner = {"a": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                      "b": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}
        self.threads = {}
        self.cross_leak = cross_leak
        self.cleanup_failure = cleanup_failure
        self.messages = 0
        self.deleted = 0

    def __call__(self, origin, token, method, path, payload=None, spoof_owner=None):
        if "/messages" in path or "/dispatch" in path:
            self.messages += 1
            raise AssertionError("MUST NEVER DISPATCH A MODEL")
        me = self.owner[token]
        if path == "/v1/me":
            return 200, {"ownerId":me}
        if path == "/v1/threads" and method == "POST":
            name=payload["threadId"]
            self.threads[name]=me
            return 201, {"thread_id":name,"owner_id":me}
        thread=path.split("/")[3]
        actual=self.threads.get(thread)
        if actual is None:
            return 404,None
        if me != actual and not self.cross_leak:
            return 404,None
        if method == "DELETE":
            if self.cleanup_failure:
                return 409,None
            self.deleted+=1
            del self.threads[thread]
            return 200,{"status":"deleted"}
        if path == "/v1/threads/" + thread:
            return 200,{"thread_id":thread,"owner_id":actual}
        return 200,{"items":[]}

class R05TwoOwner(unittest.TestCase):
    def test_two_real_principal_shapes_and_cleanup(self):
        fake=FakeHttp()
        with patch.object(module, "print"):
            self.assertTrue(module.exercise("https://example.invalid","a","b",fake))
        self.assertEqual(fake.threads,{})
        self.assertEqual(fake.deleted,2)
        self.assertEqual(fake.messages,0)

    def test_foreign_read_access_fails_closed_and_cleans(self):
        fake=FakeHttp(cross_leak=True)
        with patch.object(module, "print"):
            with self.assertRaisesRegex(module.Blocked,"CROSS_OWNER_READ_NOT_DENIED"):
                module.exercise("https://example.invalid","a","b",fake)
        self.assertEqual(fake.messages,0)
        self.assertEqual(fake.threads,{})

    def test_cleanup_failure_is_not_pass(self):
        fake=FakeHttp(cleanup_failure=True)
        with patch.object(module, "print"):
            with self.assertRaisesRegex(module.Blocked,"TEST_THREAD_CLEANUP_NOT_CONFIRMED"):
                module.exercise("https://example.invalid","a","b",fake)
        self.assertEqual(fake.messages,0)

    def test_requires_two_distinct_tokens(self):
        with self.assertRaisesRegex(module.Blocked,"TWO_DISTINCT"):
            module.exercise("https://example.invalid","same","same")

    def test_static_safety_contract(self):
        src=path.read_text()
        self.assertIn("NO_TWO_DELEGATED_GOOGLE_USER_TOKENS_CONFIGURED",src)
        self.assertIn("REFUSE_ENABLED_MODEL_DISPATCH",src)
        self.assertIn("r05_turn_receipt_and_codex_session=NOT_TESTED",src)
        self.assertNotIn("generateIdToken",src)
        self.assertNotIn("secretmanager.versions.access",src)
        self.assertNotIn('"/messages"',src)
        self.assertNotIn("print(token",src)
        workflow=Path(".github/workflows/omniagent-r05-real-two-owner.yml").read_text()
        self.assertIn("R05_OWNER_A_GOOGLE_ID_TOKEN", workflow)
        self.assertIn("R05_OWNER_B_GOOGLE_ID_TOKEN", workflow)
        self.assertIn("scripts/r05_real_two_owner.py",workflow)
        self.assertIn("git ls-remote",workflow)

if __name__ == "__main__":
    unittest.main()
