"""Legacy project-wide grant workflows must be explicit and non-default."""
from pathlib import Path
import unittest
import subprocess
import os
ROOT=Path(__file__).resolve().parents[1]
class BootstrapSafety(unittest.TestCase):
    def test_project_wide_bootstrap_is_approval_gated(self):
        for path in ("infra/gcp/bootstrap-omniagent-ci.sh",
                     "infra/gcp/bootstrap-omniagent-postgres-access.sh"):
            body=(ROOT/path).read_text()
            self.assertIn("OMNIAGENT_APPROVE_LEGACY_PROJECT_WIDE_IAM",body)
            self.assertIn('!= "yes"',body)
            self.assertIn("exit 2",body)
    def test_grants_are_denied_before_gcloud_or_vm_inputs(self):
        env={k:v for k,v in os.environ.items()
             if k!="OMNIAGENT_APPROVE_LEGACY_PROJECT_WIDE_IAM"}
        for path,args in (("infra/gcp/bootstrap-omniagent-ci.sh",()),
                          ("infra/gcp/bootstrap-omniagent-postgres-access.sh",("grant",))):
            done=subprocess.run(["bash",str(ROOT/path),*args],env=env,
                                text=True,capture_output=True,timeout=8)
            self.assertEqual(done.returncode,2)
            self.assertIn("BLOCKED",done.stderr)

if __name__ == "__main__":
    unittest.main()
