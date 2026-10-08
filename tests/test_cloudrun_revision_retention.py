"""Cloud Run retention policy tests — all GCP reads/deletes are simulated."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / "scripts" / "cloudrun_revision_retention.py"
SPEC = importlib.util.spec_from_file_location("cloudrun_revision_retention", FILE)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

SERVICE = "omniagent-chat"
NAMES = [f"{SERVICE}-{i:05d}-abc" for i in range(1, 13)]
PROMOTED = NAMES[-1]
ROLLBACK = NAMES[-2]


def snapshots():
    revisions = [
        {"metadata": {
            "name": name,
            "creationTimestamp": f"2026-10-08T00:{i:02d}:00Z",
        }}
        for i, name in enumerate(NAMES, 1)
    ]
    service = {"status": {
        "latestCreatedRevisionName": PROMOTED,
        "latestReadyRevisionName": PROMOTED,
        "traffic": [{"revisionName": PROMOTED, "percent": 100}],
    }}
    return service, revisions


class RetainTenTest(unittest.TestCase):
    def test_retention_count_is_ten(self):
        self.assertEqual(MODULE.RETAIN_COUNT, 10)

    def test_latest_ten_and_two_deletion_candidates(self):
        service, revisions = snapshots()
        plan = MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)
        self.assertEqual(plan.keep, tuple(reversed(NAMES[-10:])))
        self.assertEqual(plan.delete, (NAMES[1], NAMES[0]))

    def test_exactly_ten_no_cleanup(self):
        service, revisions = snapshots()
        plan = MODULE.select_plan(SERVICE, service, revisions[-10:], PROMOTED, ROLLBACK)
        self.assertEqual(len(plan.keep), 10)
        self.assertEqual(plan.delete, ())

    def test_fewer_than_ten_keeps_all(self):
        service, revisions = snapshots()
        plan = MODULE.select_plan(SERVICE, service, revisions[-5:], PROMOTED, ROLLBACK)
        self.assertEqual(len(plan.keep), 5)
        self.assertEqual(plan.delete, ())

    def test_eleven_deletes_only_one(self):
        service, revisions = snapshots()
        plan = MODULE.select_plan(SERVICE, service, revisions[1:], PROMOTED, ROLLBACK)
        self.assertEqual(plan.delete, (NAMES[1],))

    def test_rollback_not_necessarily_second_newest(self):
        service, revisions = snapshots()
        plan = MODULE.select_plan(SERVICE, service, revisions, PROMOTED, NAMES[-4])
        self.assertIn(NAMES[-4], plan.keep)
        self.assertEqual(len(plan.keep), 10)

    def test_tag_inside_top_ten_is_protected(self):
        service, revisions = snapshots()
        service["status"]["traffic"].append(
            {"revisionName": NAMES[-4], "percent": 0, "tag": "verified-candidate"}
        )
        self.assertEqual(
            len(MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK).delete),
            2,
        )

    def test_old_tag_blocks_cleanup(self):
        service, revisions = snapshots()
        service["status"]["traffic"].append(
            {"revisionName": NAMES[0], "percent": 0, "tag": "candidate"}
        )
        with self.assertRaisesRegex(MODULE.Blocked, "older_revision_has_live_tag"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_traffic_split_blocks_cleanup(self):
        service, revisions = snapshots()
        service["status"]["traffic"] = [
            {"revisionName": PROMOTED, "percent": 90},
            {"revisionName": ROLLBACK, "percent": 10},
        ]
        with self.assertRaisesRegex(MODULE.Blocked, "traffic_on_non_promoted_revision"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_old_active_blocks_cleanup(self):
        service, revisions = snapshots()
        service["status"]["traffic"] = [{"revisionName": NAMES[0], "percent": 100}]
        with self.assertRaisesRegex(MODULE.Blocked, "traffic_on_non_promoted_revision"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_unready_latest_blocks_cleanup(self):
        service, revisions = snapshots()
        service["status"]["latestReadyRevisionName"] = ROLLBACK
        with self.assertRaisesRegex(MODULE.Blocked, "latest_revision_not_approved_and_ready"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_promoted_not_latest_blocks_cleanup(self):
        service, revisions = snapshots()
        with self.assertRaisesRegex(MODULE.Blocked, "newest_revision_not_approved"):
            MODULE.select_plan(SERVICE, service, revisions, ROLLBACK, PROMOTED)

    def test_missing_traffic_readback_blocks_cleanup(self):
        service, revisions = snapshots()
        service["status"]["traffic"] = []
        with self.assertRaisesRegex(MODULE.Blocked, "missing_traffic_readback"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_invalid_timestamp_blocks_cleanup(self):
        service, revisions = snapshots()
        revisions[0]["metadata"]["creationTimestamp"] = None
        with self.assertRaisesRegex(MODULE.Blocked, "missing_revision_creation_timestamp"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_missing_rollback_blocks_cleanup(self):
        service, revisions = snapshots()
        with self.assertRaisesRegex(MODULE.Blocked, "rollback_revision_not_available"):
            MODULE.select_plan(SERVICE, service, revisions[-1:], PROMOTED, ROLLBACK)

    def test_rollback_outside_top_ten_blocks_cleanup(self):
        service, revisions = snapshots()
        with self.assertRaisesRegex(MODULE.Blocked, "rollback_revision_outside_latest_ten"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, NAMES[0])

    def test_duplicate_revision_blocks_cleanup(self):
        service, revisions = snapshots()
        with self.assertRaisesRegex(MODULE.Blocked, "duplicate_revision_record"):
            MODULE.select_plan(SERVICE, service, revisions + [revisions[0]], PROMOTED, ROLLBACK)

    def test_invalid_traffic_percentage_blocks_cleanup(self):
        service, revisions = snapshots()
        service["status"]["traffic"][0]["percent"] = "100"
        with self.assertRaisesRegex(MODULE.Blocked, "invalid_traffic_percentage"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_dry_run_never_calls_delete(self):
        service, revisions = snapshots()
        with patch.object(MODULE, "snapshots", return_value=(service, revisions)), patch.object(
            MODULE.subprocess, "run"
        ) as run:
            receipt = MODULE.cleanup(SERVICE, PROMOTED, ROLLBACK, apply=False)
        self.assertEqual(receipt["status"], "DRY_RUN")
        self.assertEqual(len(receipt["planned_delete"]), 2)
        run.assert_not_called()

    def test_changed_traffic_prevents_any_delete(self):
        service, revisions = snapshots()
        changed, _ = snapshots()
        changed["status"]["traffic"] = [
            {"revisionName": PROMOTED, "percent": 95},
            {"revisionName": ROLLBACK, "percent": 5},
        ]
        with patch.object(MODULE, "snapshots", side_effect=[
            (service, revisions), (changed, revisions)
        ]), patch.object(MODULE.subprocess, "run") as run:
            with self.assertRaisesRegex(MODULE.Blocked, "traffic_on_non_promoted_revision"):
                MODULE.cleanup(SERVICE, PROMOTED, ROLLBACK, apply=True)
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
