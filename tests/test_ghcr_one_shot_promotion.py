"""Offline tests for explicit one-shot release boundaries (no Cloud Run mutations)."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "ghcr_one_shot_promotion", Path("scripts/ghcr_one_shot_promotion.py"))
import sys
sys.path.insert(0, str(Path("scripts").resolve()))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
SHA = "a" * 40


def fixture():
    services = {}
    reports = {}
    for svc in release.SERVICES:
        active, candidate, fallback = (svc + suffix for suffix in ("-001", "-002", "-003"))
        services[svc] = {"status": {"latestReadyRevisionName": candidate,
                                   "traffic": [
                                       {"revisionName": active, "percent": 100},
                                       {"revisionName": candidate,
                                        "tag": "ghcr-" + SHA[:12], "percent": 0},
                                       {"revisionName": fallback, "percent": 0}]}}
        reports[svc] = {
            "formal_revision_untouched": active,
            "candidate_revision": candidate,
            "fallback_revision": fallback,
            "source_image_digest": "sha256:" + "0" * 64}
    return services, {"sha": SHA, "technical_preflight": "PASS", "services": reports}


class OneShotReleaseTest(unittest.TestCase):
    def test_only_approved_order_and_explicit_disabled_feature_scope(self):
        services, report = fixture()
        result = release.plan(SHA, services, report)
        self.assertEqual([s["service"] for s in result["steps"]],
                         list(release.PROMOTE_ORDER))
        self.assertEqual(result["steps"][-1]["service"], "omniagent-chat")
        self.assertEqual(result["rollback_rehearsal"], "WAIVED_BY_OWNER")
        self.assertEqual(result["scope"], "no_paid_provider_or_byok_activation")

    def test_missing_readiness_or_stale_traffic_blocks(self):
        services, report = fixture()
        report["technical_preflight"] = "BLOCKED"
        with self.assertRaises(release.Blocked):
            release.plan(SHA, services, report)
        report["technical_preflight"] = "PASS"
        services["omniagent-chat"]["status"]["traffic"][0]["percent"] = 99
        with self.assertRaises(release.Blocked):
            release.plan(SHA, services, report)

    def test_unready_or_wrong_candidate_blocks(self):
        services, report = fixture()
        services["omniagent-chat"]["status"]["latestReadyRevisionName"] = "other"
        with self.assertRaises(release.Blocked):
            release.plan(SHA, services, report)
        services, report = fixture()
        report["services"]["omniagent-chat"]["candidate_revision"] = "wrong"
        with self.assertRaises(release.Blocked):
            release.plan(SHA, services, report)

    def test_one_time_marker_required_in_workflow(self):
        body = Path(".github/workflows/omniagent-ghcr-one-shot-release.yml").read_text()
        self.assertIn("[release-once]", body)
        self.assertIn("head_sha", body)
        self.assertIn("concurrency:", body)
        self.assertIn("--apply", body)
        self.assertIn("scripts/cloudrun_revision_retention.py", body)
        self.assertNotIn("workflow_dispatch:", body)


if __name__ == "__main__":
    unittest.main()
