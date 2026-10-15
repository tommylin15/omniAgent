"""Legacy project-wide grant workflows must be explicit and non-default."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class BootstrapSafety(unittest.TestCase):
    def test_project_wide_bootstrap_is_approval_gated(self):
        for path in ("infra/gcp/bootstrap-omniagent-ci.sh",
                     "infra/gcp/bootstrap-omniagent-postgres-access.sh"):
            body=(ROOT/path).read_text()
            self.assertIn("OMNIAGENT_APPROVE_LEGACY_PROJECT_WIDE_IAM",body)
            self.assertIn('!= "yes"',body)
            self.assertIn("exit 2",body)
if __name__ == "__main__":
    unittest.main()
