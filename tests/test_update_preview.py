import copy
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
spec = importlib.util.spec_from_file_location("update_preview", Path(__file__).resolve().parents[1] / "scripts/update_preview.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreviewRecoveryTest(unittest.TestCase):
    def document(self, revision="old"):
        return {"spec": {"template": {"image": "fixed"}}, "status": {
            "latestReadyRevisionName": "candidate", "traffic": [
                {"revisionName": "live", "percent": 100},
                {"revisionName": "candidate", "tag": "ghcr-" + "a" * 12},
                {"revisionName": revision, "tag": "preview", "url": module.FIXED_URL}]}}

    def run_case(self, documents, fail_update=False):
        with patch.object(module, "snapshot", side_effect=documents), \
             patch.object(module, "check_source"), \
             patch.object(module, "check_revision"), \
             patch.object(module, "probe", side_effect=[None] if fail_update else [RuntimeError("probe_failed"), None]), \
             patch.object(module, "update_tag", side_effect=[RuntimeError("update_failed"), None] if fail_update else None) as update:
            result = module.run("candidate", "a" * 40, "sha256:" + "b" * 64)
            return result, update.call_args_list

    def test_probe_failure_restores_previous_preview(self):
        before, after = self.document(), self.document("candidate")
        result, calls = self.run_case([before, before, after, after, before])
        self.assertEqual(result["validation"], "FAIL")
        self.assertEqual(result["recovery"], "PASS")
        self.assertEqual([call.args[0] for call in calls], ["candidate", "old"])

    def test_failed_gcloud_command_can_still_have_mutated_route(self):
        before, after = self.document(), self.document("candidate")
        result, calls = self.run_case([before, before, after, before], True)
        self.assertEqual(result["recovery"], "PASS")
        self.assertEqual(len(calls), 2)

    def test_concurrent_change_is_not_overwritten(self):
        before, after = self.document(), self.document("candidate")
        drift = self.document("someone-else")
        result, calls = self.run_case([before, before, after, drift])
        self.assertEqual(result["recovery"], "BLOCKED")
        self.assertEqual(len(calls), 1)

    def test_restore_readback_failure_is_not_reported_as_success(self):
        before, after = self.document(), self.document("candidate")
        result, calls = self.run_case([before, before, after, after, after])
        self.assertEqual(result["recovery"], "FAIL")

    def test_success_checks_all_protected_routing(self):
        before, after = self.document(), self.document("candidate")
        with patch.object(module, "snapshot", side_effect=[before,before,after,after]), \
             patch.object(module, "check_source"), patch.object(module, "check_revision"), \
             patch.object(module, "update_tag") as update, patch.object(module, "probe") as probe:
            result=module.run("candidate","a"*40,"sha256:"+"b"*64)
            self.assertEqual(result["validation"],"PASS")
            probe.assert_called_once_with(module.FIXED_URL)
            update.assert_called_once_with("candidate")

    def test_restored_route_with_failed_health_is_not_recovery_pass(self):
        before,after=self.document(),self.document("candidate")
        with patch.object(module,"snapshot",side_effect=[before,before,after,after,before]), \
             patch.object(module,"check_source"),patch.object(module,"check_revision"), \
             patch.object(module,"update_tag"),patch.object(module,"probe",side_effect=RuntimeError("unhealthy")):
            self.assertEqual(module.run("candidate","a"*40,"sha256:"+"b"*64)["recovery"],"FAIL")


if __name__ == "__main__":
    unittest.main()
