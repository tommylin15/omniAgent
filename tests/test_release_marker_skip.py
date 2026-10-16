import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class ReleaseMarkerSkip(unittest.TestCase):
    def test_non_release_commit_is_safe_successful_noop(self):
        yaml = (ROOT / ".github/workflows/omniagent-ghcr-one-shot-release.yml").read_text()
        self.assertIn("id: authorization", yaml)
        self.assertIn("formal_release=NOT_RUN_NO_OWNER_RELEASE_MARKER", yaml)
        self.assertIn("authorized=false", yaml)
        self.assertIn("authorized=true", yaml)
        self.assertIn("if ! git log -1 --format=%B | grep -Fq '[release-once]'", yaml)
        self.assertGreaterEqual(yaml.count("if: steps.authorization.outputs.authorized == 'true'"), 6)
        self.assertEqual(yaml.count("if: always() && steps.authorization.outputs.authorized == 'true'"), 2)
        self.assertIn("cloudrun_revision_retention.py", yaml)

if __name__ == "__main__":
    unittest.main()
