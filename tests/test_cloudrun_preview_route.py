"""Contract tests for fixed-preview tag updates. Never call real GCP/network."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "cloudrun_preview_route.py"
spec = importlib.util.spec_from_file_location("cloudrun_preview_route", MODULE)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)

SHA = "f" * 40
TARGET = "omniagent-chat-00042-six"
PRIOR = "omniagent-chat-00039-rik"
DIGEST = "sha256:" + "1" * 64


def snapshot(preview_revision=PRIOR, serving=PRIOR, target=TARGET):
    tags = [{"revisionName": serving, "percent": 100},
            {"revisionName": target, "percent": 0,
             "tag": "ghcr-" + SHA[:12], "url": "https://ghcr-f"}]
    if preview_revision:
        tags.append({"revisionName": preview_revision, "percent": 0,
                     "tag": "preview", "url": preview.ORIGIN})
    return {"metadata": {"annotations": {"run.googleapis.com/ingress": "all"}},
            "spec": {"template": {"spec": {"containers": [
                {"image": "ghcr.io/tommylin15/omniagent-chat@" + DIGEST}]}}},
            "status": {"latestReadyRevisionName": target,
                       "latestCreatedRevisionName": target, "traffic": tags}}


class PreviewTest(unittest.TestCase):
    def test_unchanged_config_and_other_tags(self):
        before = snapshot()
        after = snapshot(TARGET)
        preview.verify_preserved(before, after)
        preview.preview_points_to(after, TARGET)

    def test_formal_traffic_change_blocks(self):
        before, after = snapshot(), snapshot(TARGET, serving=TARGET)
        with self.assertRaises(preview.Blocked):
            preview.verify_preserved(before, after)

    def test_other_tag_loss_blocks(self):
        before, after = snapshot(), snapshot(TARGET)
        after["status"]["traffic"][1]["tag"] = "evil-tag"
        with self.assertRaises(preview.Blocked):
            preview.verify_preserved(before, after)

    def test_runtime_config_change_blocks(self):
        before, after = snapshot(), snapshot(TARGET)
        after["spec"]["template"]["spec"]["serviceAccountName"] = "changed"
        with self.assertRaises(preview.Blocked):
            preview.verify_preserved(before, after)

    def test_digest_or_stale_candidate_blocks(self):
        bad = snapshot()
        with self.assertRaises(preview.Blocked):
            preview.verify_candidate(bad, SHA, TARGET, PRIOR, "sha256:" + "2" * 64)
        bad["status"]["latestReadyRevisionName"] = PRIOR
        with self.assertRaises(preview.Blocked):
            preview.verify_candidate(bad, SHA, TARGET, PRIOR, DIGEST)

    @patch.object(preview, "assert_current_sha")
    @patch.object(preview, "verify_http")
    @patch.object(preview, "revision")
    @patch.object(preview, "change_preview")
    @patch.object(preview, "service")
    def test_success_changes_preview_only(self, read, update, prior, http, current):
        before, after = snapshot(), snapshot(TARGET)
        read.side_effect = [before, deepcopy(before), after]
        receipt = preview.publish(SHA, TARGET, PRIOR, DIGEST, True)
        self.assertEqual(receipt["status"], "PASS")
        update.assert_called_once_with(TARGET)
        self.assertEqual(receipt["preview_after"], TARGET)

    @patch.object(preview, "assert_current_sha")
    @patch.object(preview, "verify_http")
    @patch.object(preview, "revision")
    @patch.object(preview, "change_preview")
    @patch.object(preview, "service")
    def test_failed_preview_http_restores_original(self, read, update, prior, http, current):
        before, after = snapshot(), snapshot(TARGET)
        read.side_effect = [before, deepcopy(before), after, after, before]
        http.side_effect = [None, preview.Blocked("http"), None]
        receipt = preview.publish(SHA, TARGET, PRIOR, DIGEST, True)
        self.assertEqual(receipt["status"], "FAIL")
        self.assertEqual(receipt["recovery"], "PASS")
        self.assertEqual(receipt["preview_after"], PRIOR)
        self.assertEqual(update.call_args_list[0].args, (TARGET,))
        self.assertEqual(update.call_args_list[1].args, (PRIOR,))

    @patch.object(preview, "assert_current_sha")
    @patch.object(preview, "verify_http")
    @patch.object(preview, "revision")
    @patch.object(preview, "change_preview")
    @patch.object(preview, "service")
    def test_external_drift_blocks_restoration(self, read, update, prior, http, current):
        before, after = snapshot(), snapshot(TARGET)
        drift = deepcopy(after)
        drift["status"]["traffic"][0]["revisionName"] = TARGET
        read.side_effect = [before, deepcopy(before), after, drift]
        http.side_effect = [None, preview.Blocked("http")]
        receipt = preview.publish(SHA, TARGET, PRIOR, DIGEST, True)
        self.assertEqual(receipt["status"], "FAIL")
        self.assertEqual(receipt["recovery"], "FAIL")
        update.assert_called_once_with(TARGET)

    @patch.object(preview, "assert_current_sha")
    @patch.object(preview, "verify_http")
    @patch.object(preview, "revision")
    @patch.object(preview, "change_preview")
    @patch.object(preview, "service")
    def test_dry_run_never_mutates(self, read, update, prior, http, current):
        read.return_value = snapshot()
        receipt = preview.publish(SHA, TARGET, PRIOR, DIGEST, False)
        self.assertEqual(receipt["status"], "DRY_RUN")
        update.assert_not_called()

    @patch.object(preview, "assert_current_sha")
    @patch.object(preview, "verify_http")
    @patch.object(preview, "revision")
    @patch.object(preview, "change_preview")
    @patch.object(preview, "service")
    def test_first_preview_failure_removes_only_new_tag(self, read, update, prior, http, current):
        before, after = snapshot(None), snapshot(TARGET)
        read.side_effect = [before, deepcopy(before), after, after, before]
        http.side_effect = [preview.Blocked("http")]
        receipt = preview.publish(SHA, TARGET, PRIOR, DIGEST, True)
        self.assertEqual(receipt["recovery"], "PASS")
        self.assertIsNone(receipt["preview_after"])
        self.assertEqual(update.call_args_list[1].args, (None,))


if __name__ == "__main__":
    unittest.main()
