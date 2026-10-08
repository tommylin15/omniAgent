"""Guard new image publishing and Cloud Run candidate against unsafe bypasses."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
GHCR=ROOT/".github/workflows/omniagent-ghcr-publish.yml"
CANDIDATE=ROOT/".github/workflows/omniagent-ghcr-cloudrun-candidate.yml"
RETAIN=ROOT/".github/workflows/omniagent-cloudrun-retain-ten.yml"


class NewDeliveryGuardTests(unittest.TestCase):
    def test_publish_is_main_source_triggered(self):
        t=GHCR.read_text()
        self.assertIn("branches: [main]",t)
        for item in ("'services/**'","'apps/agent_app/**'","'tests/**'","'package.json'"):
            self.assertIn(item,t)
        self.assertIn("needs: quality",t)
        self.assertIn("ghcr.io/tommylin15/",t)

    def test_publish_never_calls_legacy_build(self):
        t=GHCR.read_text()
        for forbidden in ("gcloud builds submit","gcloud builds triggers run","gcloud storage cp",
                          "gcloud artifacts docker", "docker.pkg.dev"):
            self.assertNotIn(forbidden,t)

    def test_candidate_depends_on_successful_publish_from_this_repo(self):
        t=CANDIDATE.read_text()
        self.assertIn("workflow_run:",t)
        self.assertIn("workflow_run.conclusion == 'success'",t)
        self.assertIn("head_repository.full_name == 'tommylin15/omniAgent'",t)
        self.assertIn("workflow_run.head_sha",t)
        self.assertIn("ghcr.io/tommylin15/",t)
        self.assertIn("docker buildx imagetools inspect",t)

    def test_candidate_cannot_change_formal_traffic(self):
        t=CANDIDATE.read_text()
        self.assertIn("--no-traffic",t)
        self.assertIn("serving(before)!=serving(after)",t)
        self.assertNotIn("--to-latest",t)
        self.assertNotIn("--allow-unauthenticated",t)
        self.assertNotIn("gcloud builds",t)
        self.assertNotIn("gcloud storage cp",t)
        self.assertNotIn("gcloud artifacts repositories delete",t)

    def test_retention_requires_approval(self):
        t=RETAIN.read_text()
        self.assertIn("inputs.acceptance_and_promotion_passed",t)
        self.assertIn("--apply",t)
        self.assertNotIn("workflow_dispatch:",t)


if __name__=="__main__":
    unittest.main()
