"""Static safety checks for one-shot read-only Owner A database readback."""
from pathlib import Path
import unittest

SCRIPT=Path("infra/gcp/p0-owner-live-readback.sh")
WF=Path(".github/workflows/omniagent-p0-owner-real-readback.yml")
class OwnerLiveReadback(unittest.TestCase):
    def test_readonly_sql_and_exact_owner(self):
        source=SCRIPT.read_text()
        for value in ("expected_hash=", "SET ROLE omniagent_chat_app;", "BEGIN READ ONLY;",
                      "ROLLBACK;", "omni_chat.codex_trial_budgets",
                      "omni_chat.events", "omni_chat.codex_turn_sessions",
                      "2026-10-11T12:55:00Z", "turn_completed", "text_delta",
                      "p0_owner_text_and_terminal_persisted", "p0_owner_db_scope_integrity"):
            self.assertIn(value,source)
        for forbidden in ("INSERT INTO", "DELETE FROM", "UPDATE omni_chat", "gcloud secrets versions access",
                          "gcloud run deploy", "update-traffic", "consumed_turns=0"):
            self.assertNotIn(forbidden,source)
    def test_one_shot_marker_and_no_auto_release(self):
        workflow=WF.read_text()
        self.assertIn("[p0-evidence-once]", workflow)
        self.assertIn("bash -n infra/gcp/p0-owner-live-readback.sh", workflow)
        self.assertNotIn("[release-once]", workflow)
        self.assertNotIn("workflow_dispatch:", workflow)
        self.assertNotIn("update-traffic", workflow)
        self.assertIn("Owner B live authenticated negative: NOT VERIFIED", workflow)

if __name__=="__main__": unittest.main()
