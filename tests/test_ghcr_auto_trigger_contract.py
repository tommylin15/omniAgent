"""Regression checks for the production-safe GHCR auto-trigger chain.

These static checks complement, but never replace, actual GitHub Actions
workflow_run and Cloud Run evidence.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"


def workflow(name: str) -> str:
    return (WORKFLOWS / name).read_text(encoding="utf-8")


class GhcrAutomaticTriggerContractTest(unittest.TestCase):
    def test_source_push_runs_quality_and_three_image_publish(self):
        source = workflow("omniagent-ghcr-publish.yml")
        self.assertRegex(source, r"(?m)^on:\n  push:\n    branches: \[main\]")
        self.assertIn("- 'tests/**'", source)
        self.assertIn("needs: quality", source)
        for image in ("omniagent-chat", "omniagent-agent-gateway", "omniagent-shared-codex"):
            with self.subTest(image=image):
                self.assertIn("image: " + image, source)
        self.assertIn("ghcr_image_digest=PASS", source)

    def test_publish_success_automatically_starts_no_traffic_candidates(self):
        source = workflow("omniagent-ghcr-cloudrun-candidate.yml")
        self.assertRegex(source, r"(?m)^on:\n  workflow_run:")
        self.assertIn("workflows: ['omniAgent GHCR image publish']", source)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", source)
        self.assertIn("github.event.workflow_run.event == 'push'", source)
        self.assertIn("github.event.workflow_run.head_branch == 'main'", source)
        self.assertIn("--no-traffic", source)
        self.assertIn("traffic_preserved=PASS", source)

    def test_secret_preflight_blocks_all_candidate_mutations_when_unverified(self):
        source = workflow("omniagent-ghcr-cloudrun-candidate.yml")
        preflight = source.index("name: Fail closed on disabled or unreadable Secret versions")
        deploy = source.index("name: Deploy immutable public GHCR candidates with NO traffic")
        self.assertLess(preflight, deploy)
        self.assertIn('candidate_secret_version_preflight=BLOCKED', source)
        self.assertIn('gcloud","secrets","versions","describe"', source)
        self.assertIn('if state!="ENABLED":', source)
        self.assertIn("raise SystemExit(1)", source)
        self.assertNotIn("gcloud secrets versions access", source)

    def test_candidate_success_automatically_starts_read_only_smoke(self):
        source = workflow("omniagent-ghcr-current-candidate-smoke.yml")
        self.assertRegex(source, r"(?m)^on:\n  workflow_run:")
        self.assertIn("workflows: ['omniAgent GHCR Cloud Run zero-traffic candidates']", source)
        self.assertNotIn("  push:", source)
        self.assertNotIn("  workflow_dispatch:", source)
        self.assertIn("github.event_name == 'workflow_run'", source)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", source)
        self.assertIn("github.event.workflow_run.head_branch == 'main'", source)
        self.assertIn("RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}", source)
        self.assertIn("current_ghcr_candidate_signed_smoke=PASS", source)
        self.assertIn("formal_traffic_preserved=PASS", source)


if __name__ == "__main__":
    unittest.main()
