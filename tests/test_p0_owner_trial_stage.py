import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
PY=ROOT/"scripts/p0_owner_trial_stage.py"
SH=ROOT/"infra/gcp/p0-owner-trial-enroll.sh"
WF=ROOT/".github/workflows/omniagent-p0-owner-trial-staging.yml"
class OwnerTrialStage(unittest.TestCase):
    def test_exact_owner_one_time_budget_no_reset(self):
        sh=SH.read_text()
        self.assertIn("db=omniagent_chat",sh)
        self.assertIn("INSERT INTO omni_chat.codex_trial_budgets",sh)
        self.assertIn("ON CONFLICT(owner_id) DO NOTHING",sh)
        self.assertIn("12 hours",sh)
        self.assertNotIn("8b330f02-639d-4284-9e79-b2f183f74d06",sh)
        self.assertNotIn("UPDATE omni_chat.codex_trial_budgets",sh)
    def test_candidate_is_zero_traffic_and_latest_template_restored(self):
        source=PY.read_text()
        for expected in ("--no-traffic","--update-env-vars","--remove-env-vars",
                         '"CHAT_DISPATCH_ENABLED":"false"',"CODEX_CHAT_TRIAL_OWNER_SECRETS",
                         "formal_traffic_unchanged=PASS", "p0_owner_trial_canary=PASS_ZERO_TRAFFIC"):
            self.assertIn(expected,source)
        for forbidden in ("update-traffic","[release-once]","gcloud secrets versions access",
                          "gcloud secrets versions add","gcloud secrets versions destroy"):
            self.assertNotIn(forbidden,source)
    def test_marker_and_same_sha_required(self):
        wf=WF.read_text()
        self.assertIn("[p0-trial-once]",wf)
        self.assertIn("git ls-remote",wf)
        self.assertIn("shared_secret_iam_access=VERIFIED_DIRECT_ACCESSOR",wf)
        self.assertIn("workflow_run:",wf)
if __name__=="__main__": unittest.main()
