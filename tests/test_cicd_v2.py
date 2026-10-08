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
    @staticmethod
    def private_chat_service():
        return {"spec": {"template": {
            "metadata": {"annotations": {
                "run.googleapis.com/vpc-access-egress": "private-ranges-only",
                "run.googleapis.com/network-interfaces": '[{"network":"approved-private"}]'}},
            "spec": {"containers": [{"env": [{
                "name": "CHAT_DATABASE_URL",
                "valueFrom": {"secretKeyRef": {"name": "omniagent-chat-db", "key": "latest"}}
            }]}]}}}}

    def test_chat_tls_requires_private_egress_and_dedicated_secret(self):
        good = self.private_chat_service()
        v2.require_private_chat_tls_target(good)
        missing_vpc = self.private_chat_service()
        del missing_vpc["spec"]["template"]["metadata"]["annotations"]["run.googleapis.com/network-interfaces"]
        with self.assertRaisesRegex(RuntimeError, "private VPC"):
            v2.require_private_chat_tls_target(missing_vpc)
        old_secret = self.private_chat_service()
        old_secret["spec"]["template"]["spec"]["containers"][0]["env"][0]["valueFrom"]["secretKeyRef"]["name"] = "historical-bundle"
        with self.assertRaisesRegex(RuntimeError, "dedicated DB Secret"):
            v2.require_private_chat_tls_target(old_secret)

    def test_chat_candidate_tls_mode_must_be_read_back(self):
        revision = {"spec": {"containers": [{"env": [{
            "name": "CHAT_DATABASE_TLS_MODE", "value": "private-self-signed"}]}]}}
        v2.require_chat_candidate_tls(revision)
        revision["spec"]["containers"][0]["env"][0]["value"] = "default"
        with self.assertRaisesRegex(RuntimeError, "TLS mode drift"):
            v2.require_chat_candidate_tls(revision)

    def test_candidate_tag_fits_cloud_run_for_every_existing_service(self):
        def stop_at_deploy(*args):
            if args[:2] == ("run", "deploy"):
                raise RuntimeError("deployment boundary")
            return ""
        for key, name in v2.SERVICES.items():
            state = {"sha": "a" * 40, "components": [key], "services": {key: {"image": "pkg@sha256:test"}}}
            with patch.object(v2, "fresh"), patch.object(v2, "cloud_json", return_value=[]), \
                patch.object(v2, "service", return_value=self.private_chat_service()), \
                patch.object(v2, "gcloud", side_effect=stop_at_deploy) as sdk:
                with self.assertRaisesRegex(RuntimeError, "deployment boundary"):
                    v2.deploy(state)
            tag = next(arg.split("=", 1)[1] for arg in sdk.call_args.args if arg.startswith("--tag="))
            self.assertLessEqual(len(tag) + len(name), 46)
            if key == "chat":
                self.assertIn("--no-traffic", sdk.call_args.args)
                self.assertIn("--update-env-vars=CHAT_DATABASE_TLS_MODE=private-self-signed", sdk.call_args.args)

    def test_missing_sha_image_builds_without_parsing_sdk_error_text(self):
        state = {"sha": "a" * 40, "components": ["chat"], "google_client_id": "existing",
            "services": {"chat": {}}}
        def sdk(*args):
            if args[:4] == ("artifacts", "docker", "images", "describe"):
                raise RuntimeError("Image not found")
            return ""
        with patch.object(v2, "fresh"), patch.object(v2, "save"), patch.object(v2, "cloud_json", return_value=[]), \
            patch.object(v2, "gcloud", side_effect=sdk), patch.object(v2, "command") as docker:
            with self.assertRaises(RuntimeError):
                v2.build_images(state)
        self.assertTrue(any(call.args[0][:2] == ["docker", "build"] for call in docker.call_args_list))

    def test_historical_runtime_digest_recovers_unique_source_sha(self):
        package = v2.REGISTRY + "/omniagent-shared-codex"
        rows = [{"package": package, "version": "sha256:active", "tags": ["a" * 40]},
            {"package": package, "version": "sha256:other", "tags": ["b" * 40]}]
        self.assertEqual(v2.historical_sha(package + "@sha256:active", rows), "a" * 40)
        rows[0]["tags"].append("c" * 40)
        self.assertIsNone(v2.historical_sha(package + "@sha256:active", rows))

    def test_image_builder_uses_python_enabled_sdk_image(self):
        config = (Path(__file__).parents[1] / "cloudbuild-v2.yaml").read_text()
        builder = config.split("- id: immutable-docker-build-and-push", 1)[1].split("- id:", 1)[0]
        self.assertIn("google-cloud-cli:slim", builder)
        self.assertIn("docker-cli docker-buildx", builder)
        self.assertNotIn("docker.io", builder)

    def test_recovery_tag_on_active_revision_can_report_100_percent(self):
        original, candidate = "chat-old", "chat-candidate"
        for tagged_percent in (0, 100):
            snapshot = {"status": {"traffic": [
                {"revisionName": original, "percent": 100},
                {"revisionName": original, "tag": "recovery", "url": "https://tagged", "percent": tagged_percent},
                {"revisionName": candidate, "percent": 0}]}}
            self.assertEqual(v2.recovery_route(snapshot, "recovery", original, {original: 100})["url"], "https://tagged")

    def test_recovery_route_fails_closed_on_revision_or_traffic_drift(self):
        snapshot = {"status": {"traffic": [{"revisionName": "changed", "percent": 100},
            {"revisionName": "candidate", "tag": "recovery", "url": "https://tagged", "percent": 0}]}}
        with self.assertRaisesRegex(RuntimeError, "active traffic"):
            v2.recovery_route(snapshot, "recovery", "candidate", {"original": 100})
        with self.assertRaisesRegex(RuntimeError, "revision/url"):
            v2.recovery_route(snapshot, "recovery", "wrong", {"changed": 100})

    def test_cleanup_refetches_missing_revision_digest_before_dry_run(self):
        package = v2.REGISTRY + "/omniagent-chat"
        old = package + "@sha256:" + "a" * 64
        free = package + "@sha256:" + "b" * 64
        runtime = {"metadata": {"name": "omniagent-chat",
            "labels": {"cloud.googleapis.com/location": "us-central1"}}}
        listed = {"metadata": {"name": "omniagent-chat-00001-abc"}}
        described = {"status": {"imageDigest": old}}
        images = [{"package": package, "version": "sha256:" + key * 64} for key in "ab"]
        with patch.object(v2, "cloud_json", side_effect=[[runtime], [listed], described, [], images]) as sdk, \
            patch.object(v2, "save"):
            state = {"services": {}}
            v2.cleanup(state)
        self.assertEqual(state["cleanup_dry_run"], [free])
        self.assertEqual(sdk.call_args_list[2].args[:3], ("run", "revisions", "describe"))

    def test_cleanup_refuses_missing_immutable_revision_image(self):
        with patch.object(v2, "cloud_json", return_value={"spec": {"containers": [{"image": "unresolved:latest"}]}}):
            with self.assertRaisesRegex(RuntimeError, "revision digest unavailable"):
                v2.revision_image({"metadata": {"name": "legacy"}}, "us-central1")

    def test_cleanup_keeps_job_and_execution_images(self):
        state = {"services": {}}
        package = v2.REGISTRY + "/omniagent-chat"
        job = {"metadata": {"name": "existing-job", "labels": {"cloud.googleapis.com/location": "us-central1"}},
            "spec": {"template": {"containers": [{"image": package + ":" + "a" * 40}]}}}
        execution = {"spec": {"taskTemplate": {"containers": [{"image": package + "@sha256:" + "b" * 64}]}}}
        images = [{"package": package, "version": "sha256:" + char * 64} for char in "abc"]
        with patch.object(v2, "cloud_json", side_effect=[[], [job], [execution], images]), patch.object(v2, "save"), \
            patch.object(v2, "gcloud", return_value="sha256:" + "a" * 64):
            v2.cleanup(state)
        self.assertEqual(state["cleanup_dry_run"], [package + "@sha256:" + "c" * 64])

    def test_repository_read_token_uses_the_rest_access_method(self):
        with patch.object(v2, "gcloud", return_value="redacted"), patch.object(v2, "api", return_value={"token": "ephemeral"}) as remote:
            self.assertEqual(v2.github_token(), "ephemeral")
        self.assertEqual(remote.call_args.args[0], "https://cloudbuild.googleapis.com/v2/" + v2.REPOSITORY + ":accessReadToken")

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
