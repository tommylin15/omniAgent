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

    def test_revision_import_mirror_uses_verified_source_ghcr_digest(self):
        import importlib.util
        import json
        from unittest.mock import patch
        spec = importlib.util.spec_from_file_location("p0_owner_trial_stage", PY)
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        service = "omniagent-chat"
        digest = "a" * 64
        origin = "ghcr.io/tommylin15/" + service + "@sha256:" + digest
        doc = {"spec": {"template": {"spec": {"containers": [{"image": origin}]}}}}
        revision = service + "-00099-test"
        def runtime(image, ready=True):
            return json.dumps({"spec": {"containers": [{"image": image}]},
                               "status": {"conditions": [
                                   {"type": "Ready", "status": "True" if ready else "False"}]}})
        imported = "us-docker.pkg.dev/cloud-run/container/import@sha256:" + digest
        with patch.object(stage, "cmd", return_value=runtime(imported)):
            self.assertEqual(stage.image_for(service, doc, revision), origin)
        with patch.object(stage, "cmd", return_value=runtime(origin)):
            self.assertEqual(stage.image_for(service, doc, revision), origin)
        for invalid in ("us-docker.pkg.dev/cloud-run/container/import@sha256:" + "b"*64,
                        "ghcr.io/tommylin15/other-service@sha256:" + "b"*64,
                        "ghcr.io/tommylin15/omniagent-chat:latest"):
            with self.subTest(invalid=invalid), patch.object(stage, "cmd", return_value=runtime(invalid)):
                with self.assertRaisesRegex(RuntimeError, "revision digest differs"):
                    stage.image_for(service, doc, revision)
        with patch.object(stage, "cmd", return_value=runtime(imported, False)):
            with self.assertRaisesRegex(RuntimeError, "not ready"):
                stage.image_for(service, doc, revision)
        wrong_doc = {"spec": {"template": {"spec": {"containers": [
            {"image": "ghcr.io/tommylin15/omniagent-agent-gateway@sha256:" + digest}]}}}}
        with patch.object(stage, "cmd", return_value=runtime(imported)):
            with self.assertRaisesRegex(RuntimeError, "not pinned public GHCR"):
                stage.image_for(service, wrong_doc, revision)
            with self.assertRaisesRegex(RuntimeError, "identity mismatch"):
                stage.image_for(service, doc, "omniagent-agent-gateway-00099-test")
        mutable_doc = {"spec": {"template": {"spec": {"containers": [
            {"image": "ghcr.io/tommylin15/omniagent-chat:latest"}]}}}}
        with patch.object(stage, "cmd", return_value=runtime(imported)):
            with self.assertRaisesRegex(RuntimeError, "not pinned public GHCR"):
                stage.image_for(service, mutable_doc, revision)

if __name__=="__main__": unittest.main()
