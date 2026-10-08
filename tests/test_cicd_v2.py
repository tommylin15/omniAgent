"""Runnable safety checks: python -m unittest discover -s tests -p test_cicd_v2.py."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location("cicd_v2", Path(__file__).parents[1] / "infra/gcp/cicd_v2.py")
v2 = importlib.util.module_from_spec(spec)
if spec.loader and Path(spec.origin).exists():
    spec.loader.exec_module(v2)


class ReleaseSafety(unittest.TestCase):
    def test_shared_change_rebuilds_all_images_and_ui_change_rebuilds_chat(self):
        self.assertEqual(v2.changed_components(["package-lock.json"]), set(v2.SERVICES))
        self.assertEqual(v2.changed_components(["apps/agent_app/lib/main.dart"]), {"chat"})
        self.assertEqual(v2.changed_components(["services/agent-gateway/codex_bridge.ts"]), {"gateway", "shared"})
        self.assertEqual(v2.changed_components(["services/agent-gateway/agent_security.ts"]), set(v2.SERVICES))
        self.assertEqual(v2.changed_components(["services/agent-gateway/openrouter_provider.ts"]), {"gateway"})
        self.assertEqual(v2.changed_components(["tests/chat_api.test.ts", "infra/gcp/cicd_v2.py"]), set())
        self.assertEqual(v2.changed_components(["doc/todo.md"]), set())
        self.assertEqual(v2.changed_components(["services/chat-api/deleted.ts"]), {"chat"})
        self.assertEqual(v2.changed_components(None), set(v2.SERVICES))

    def test_partial_promotion_failure_restores_every_modified_traffic_target(self):
        state = {"sha": "a" * 40, "components": ["chat", "shared"], "gates": {name: "PASS" for name in
            ("chat", "flutter", "gateway", "shared", "browser_oauth", "chat_gateway_integration", "recovery")},
            "services": {key: {"previous_traffic": [{"revisionName": key + "-old", "percent": 100}],
                "candidate_revision": key + "-new", "image": key + "@sha256:built"} for key in ("chat", "shared")}}
        traffic = {key: key + "-old" for key in ("chat", "shared")}
        def runtime(name):
            key = next(key for key, value in v2.SERVICES.items() if value == name)
            return {"status": {"traffic": [{"revisionName": traffic[key], "percent": 100}]}}
        def mutate(*args):
            if args[:3] == ("run", "services", "update-traffic"):
                key = next(key for key, value in v2.SERVICES.items() if value == args[3])
                target = next(a.split("=", 1)[1].rsplit("=", 1)[0] for a in args if a.startswith("--to-revisions="))
                traffic[key] = target
                if target == "shared-new":
                    raise RuntimeError("simulated control-plane response loss after mutation")
        with patch.object(v2, "fresh"), patch.object(v2, "save"), patch.object(v2, "read_object", return_value=None), patch.object(v2, "service", side_effect=runtime), \
            patch.object(v2, "gcloud", side_effect=mutate), patch.object(v2, "cloud_json", return_value={"status": {"imageDigest": "chat@sha256:built"}}):
            with self.assertRaises(RuntimeError):
                v2.release(state, "canonical")
        self.assertEqual(traffic, {"chat": "chat-old", "shared": "shared-old"})
        self.assertEqual(state["recovery"], "PASS")

    def test_stale_or_duplicate_build_cannot_release(self):
        sha = "a" * 40
        v2.require_current(sha, sha)
        with self.assertRaises(RuntimeError):
            v2.require_current(sha, "b" * 40)
        self.assertFalse(v2.is_build_turn("later", [{"id": "first", "createTime": "1"}, {"id": "later", "createTime": "2"}]))
        self.assertTrue(v2.is_build_turn("first", [{"id": "first", "createTime": "1"}, {"id": "later", "createTime": "2"}]))

    def test_noop_cannot_hide_failed_live_gates(self):
        # A docs-only work package has no deployment gates or provider calls.
        state = {"components": [], "gates": {"chat": "NOT_RUN"}}
        with patch.object(v2, "save"):
            v2.release(state, "canonical")
        self.assertEqual(state["release_result"], "NO_RUNTIME_CHANGE")

    def test_release_cost_limits_are_enforced(self):
        with self.assertRaises(RuntimeError):
            v2.require_budget({"attempts": 2, "provider_calls": 0}, max_attempts=2, max_provider_calls=5)
        with self.assertRaises(RuntimeError):
            v2.require_budget({"attempts": 0, "provider_calls": 5}, max_attempts=2, max_provider_calls=5)
        v2.require_budget({"attempts": 1, "provider_calls": 3}, max_attempts=2, max_provider_calls=5)

    def test_cleanup_preserves_manual_recovery_tags(self):
        image = {"version": v2.REGISTRY + "/omniagent-chat@sha256:old", "tags": ["manual-recovery"]}
        self.assertEqual(v2.cleanup_candidates([image], set()), [])
        image["tags"] = ["a" * 40]
        self.assertEqual(v2.cleanup_candidates([image], set()), [image["version"]])

    def test_cleanup_keeps_every_revision_and_candidate_digest(self):
        repo = v2.REGISTRY
        protected = {repo + "/omniagent-chat@sha256:active", repo + "/omniagent-chat@sha256:rollback"}
        images = [{"package": repo + "/omniagent-chat", "version": "sha256:" + name} for name in ("active", "rollback", "candidate", "old")]
        candidate = repo + "/omniagent-chat@sha256:candidate"
        plan = v2.cleanup_candidates(images, protected | {candidate})
        self.assertEqual(plan, [repo + "/omniagent-chat@sha256:old"])
        images.append({"version": repo + "/unowned-component@sha256:old"})
        self.assertEqual(v2.cleanup_candidates(images, protected | {candidate}), plan)

    def test_stale_lock_deletion_cannot_steal_a_new_owner_generation(self):
        conflict = urllib.error.HTTPError("url", 412, "generation conflict", {}, None)
        requests = []
        def delete(req, **kwargs):
            requests.append(req.full_url)
            raise conflict
        with patch.object(v2, "store_object", side_effect=conflict), patch.object(v2, "gcloud", return_value="redacted"), \
            patch.object(v2, "api", side_effect=[{"generation": "7"}, {"build_id": "old"}]), \
            patch.object(v2, "cloud_json", return_value={"status": "FAILURE"}), patch.object(v2.urllib.request, "urlopen", side_effect=delete):
            with self.assertRaises(urllib.error.HTTPError):
                v2.lock({"build_id": "new", "sha": "a" * 40}, "shared-codex")
        self.assertTrue(requests[0].endswith("?ifGenerationMatch=7"))

    def test_candidate_requires_zero_traffic_and_matching_runtime_digest(self):
        data = {"status": {"traffic": [{"tag": "candidate", "revisionName": "rev", "url": "https://candidate", "percent": 0}]}}
        self.assertEqual(v2.candidate_route(data, "candidate")["revisionName"], "rev")
        data["status"]["traffic"][0]["percent"] = 1
        with self.assertRaises(RuntimeError):
            v2.candidate_route(data, "candidate")
        v2.require_digest("repo@sha256:a", "repo@sha256:a")
        with self.assertRaises(RuntimeError):
            v2.require_digest("repo@sha256:a", "repo@sha256:b")


if __name__ == "__main__":
    unittest.main()
