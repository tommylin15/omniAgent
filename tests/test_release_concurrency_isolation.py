"""Protect currently deployed GitHub Actions release concurrency and provenance.

Retired one-shot Owner-specific workflows are intentionally not resurrected.
"""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]/".github/workflows"

class ReleaseConcurrencyIsolation(unittest.TestCase):
    def test_publish_smoke_candidate_and_production_release_cannot_cancel_each_other(self):
        names={
          'omniagent-ghcr-publish.yml':'omniagent-ghcr-publish',
          'omniagent-ghcr-cloudrun-candidate.yml':'omniagent-ghcr-cloudrun-release',
          'omniagent-ghcr-current-candidate-smoke.yml':'omniagent-ghcr-cloudrun-release',
          'auto-release.yml':'auto-release',
        }
        for name,group in names.items():
            source=(ROOT/name).read_text()
            self.assertIn('  group: '+group,source,name)
            self.assertIn('  cancel-in-progress: false',source,name)
        self.assertNotEqual(names['auto-release.yml'],names['omniagent-ghcr-publish.yml'])
        self.assertEqual(names['omniagent-ghcr-cloudrun-candidate.yml'],
                         names['omniagent-ghcr-current-candidate-smoke.yml'])

    def test_auto_release_accepts_only_successful_named_smoke_or_explicit_dispatch(self):
        source=(ROOT/'auto-release.yml').read_text()
        self.assertIn("workflows: ['omniAgent GHCR current candidate auto smoke']",source)
        self.assertIn("github.event.workflow_run.conclusion == 'success'",source)
        self.assertIn("github.event.workflow_run.head_branch == 'main'",source)
        self.assertIn("github.event.workflow_run.head_repository.full_name == 'tommylin15/omniAgent'",source)
        self.assertIn('scripts/ghcr_release_readiness.py',source)
        self.assertIn('scripts/ghcr_one_shot_promotion.py',source)
        self.assertIn('scripts/cloudrun_revision_retention.py',source)

if __name__=='__main__': unittest.main()
