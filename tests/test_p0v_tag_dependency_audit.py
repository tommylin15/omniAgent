"""Only classification hints; no assertion that old GHCR tags are unused."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from p0v_tag_dependency_audit import classify
class TagAuditTests(unittest.TestCase):
    def test_fixed_preview_protected(self):
        self.assertEqual(classify("preview"),"FIXED_PREVIEW__PROTECT")
    def test_owner_trial_protected(self):
        self.assertIn("PROTECT",classify("p0-trial-abc"))
    def test_p0v_consumer_protected(self):
        for value in ("p0v-market2048-00d45861","gemini-p0v-b03e5f55","p0v-formal-eab1d972"):
            self.assertIn("PROTECT",classify(value))
    def test_ghcr_needs_evidence_not_automatic_retirement(self):
        self.assertEqual(classify("ghcr-abcdef123456"),"GHCR_CANDIDATE__REVIEW_REQUIRED")
if __name__=="__main__":
    unittest.main()
