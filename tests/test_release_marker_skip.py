"""Current automatic release uses readiness checks, not retired release markers."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ReleaseMarkerSkip(unittest.TestCase):
    def test_readiness_gate_precedes_promotion_and_cleanup(self):
        flow=(ROOT/'.github/workflows/auto-release.yml').read_text()
        ready=flow.index('scripts/ghcr_release_readiness.py')
        promote=flow.index('scripts/ghcr_one_shot_promotion.py')
        cleanup=flow.index('scripts/cloudrun_revision_retention.py')
        self.assertLess(ready,promote)
        self.assertLess(promote,cleanup)
        self.assertIn("workflows: ['omniAgent GHCR current candidate auto smoke']",flow)
        self.assertIn("github.event.workflow_run.conclusion == 'success'",flow)
        self.assertIn('github.ref', (ROOT/'.github/workflows/ci.yml').read_text())

    def test_release_artifact_upload_does_not_glob_credentials(self):
        flow=(ROOT/'.github/workflows/auto-release.yml').read_text()
        self.assertIn('path: |\n            readiness.json\n            release.json',flow)
        self.assertNotIn('path: "*.json"',flow)
        self.assertNotIn('path: |\n            *.json',flow)

if __name__=='__main__': unittest.main()
