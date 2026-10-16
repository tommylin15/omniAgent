"""GitHub Actions has only one pending workflow per concurrency group.
Ensure co-triggered release/readiness/owner workflows cannot cancel each other,
and mutually exclusive markers prevent an unsafe same-SHA dual promotion.
"""
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]/".github/workflows"
class ReleaseConcurrencyIsolation(unittest.TestCase):
    def test_after_smoke_workflows_have_unique_groups(self):
        groups={
          "omniagent-ghcr-one-shot-release.yml":"omniagent-ghcr-formal-production",
          "omniagent-p0-owner-trial-staging.yml":"omniagent-p0-owner-staging",
          "omniagent-ghcr-production-readiness.yml":"omniagent-ghcr-readonly-audit",
          "omniagent-ghcr-current-candidate-smoke.yml":"omniagent-ghcr-cloudrun-release",
        }
        for filename,group in groups.items():
            contents=(ROOT/filename).read_text()
            self.assertIn("  group: "+group,contents)
            self.assertIn("  cancel-in-progress: false",contents)
        self.assertEqual(len(groups.values()),len(set(groups.values())))

    def test_conflicting_paid_trial_and_production_marker_fail_closed(self):
        prod=(ROOT/"omniagent-ghcr-one-shot-release.yml").read_text()
        trial=(ROOT/"omniagent-p0-owner-trial-staging.yml").read_text()
        self.assertIn("BLOCKED_CONFLICTING_OWNER_TRIAL_MARKER",prod)
        self.assertIn("BLOCKED_CONFLICTING_FORMAL_RELEASE_MARKER",trial)
        self.assertIn("[release-once]",prod)
        self.assertIn("[p0-trial-once]",trial)
        self.assertIn("DEPLOY_CODE_WITH_DISPATCH_AND_BYOK_DISABLED",prod)
if __name__=="__main__": unittest.main()
