"""Unit tests: no Cloud Run changes; only retention policy decisions."""
import importlib.util
from pathlib import Path
import unittest

FILE = Path(__file__).resolve().parents[1] / "scripts" / "cloudrun_revision_retention.py"
SPEC = importlib.util.spec_from_file_location("cloudrun_revision_retention", FILE)
MODULE = importlib.util.module_from_spec(SPEC)
import sys
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

SERVICE = "omniagent-chat"
NAMES = [f"{SERVICE}-0000{i}-abc" for i in range(1, 5)]
PROMOTED = NAMES[-1]
ROLLBACK = NAMES[-2]


def snapshots():
    revisions = [
        {"metadata": {"name": name, "creationTimestamp": f"2026-10-0{i}T12:00:00Z"}}
        for i, name in enumerate(NAMES, 1)
    ]
    service = {
        "status": {
            "latestCreatedRevisionName": PROMOTED,
            "latestReadyRevisionName": PROMOTED,
            "traffic": [{"revisionName": PROMOTED, "percent": 100}],
        }
    }
    return service, revisions


class RetainTwoTest(unittest.TestCase):
    def test_two_newest_only(self):
        service, revisions = snapshots()
        plan = MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)
        self.assertEqual(plan.keep, (PROMOTED, ROLLBACK))
        self.assertEqual(plan.delete, (NAMES[1], NAMES[0]))

    def test_no_cleanup_if_two_only(self):
        service, revisions = snapshots()
        plan = MODULE.select_plan(SERVICE, service, revisions[-2:], PROMOTED, ROLLBACK)
        self.assertEqual(plan.delete, ())

    def test_no_delete_when_old_revision_has_tag(self):
        service, revisions = snapshots()
        service["status"]["traffic"].append(
            {"revisionName": NAMES[0], "percent": 0, "tag": "candidate"}
        )
        with self.assertRaisesRegex(MODULE.Blocked, "older_revision_has_live_tag"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_no_delete_if_traffic_split(self):
        service, revisions = snapshots()
        service["status"]["traffic"] = [
            {"revisionName": PROMOTED, "percent": 90},
            {"revisionName": ROLLBACK, "percent": 10},
        ]
        with self.assertRaisesRegex(MODULE.Blocked, "traffic_on_non_promoted_revision"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_no_delete_if_old_active(self):
        service, revisions = snapshots()
        service["status"]["traffic"] = [{"revisionName": NAMES[0], "percent": 100}]
        with self.assertRaisesRegex(MODULE.Blocked, "traffic_on_non_promoted_revision"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_no_delete_if_unready_newest(self):
        service, revisions = snapshots()
        service["status"]["latestReadyRevisionName"] = ROLLBACK
        with self.assertRaisesRegex(MODULE.Blocked, "latest_revision_not_approved_and_ready"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_no_delete_if_promoted_not_latest(self):
        service, revisions = snapshots()
        with self.assertRaisesRegex(MODULE.Blocked, "newest_two_do_not_match"):
            MODULE.select_plan(SERVICE, service, revisions, ROLLBACK, PROMOTED)

    def test_no_delete_if_missing_traffic_readback(self):
        service, revisions = snapshots()
        service["status"]["traffic"] = []
        with self.assertRaisesRegex(MODULE.Blocked, "missing_traffic_readback"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_no_delete_if_bad_timestamp(self):
        service, revisions = snapshots()
        revisions[0]["metadata"]["creationTimestamp"] = None
        with self.assertRaisesRegex(MODULE.Blocked, "missing_revision_creation_timestamp"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, ROLLBACK)

    def test_only_two_revision_not_guaranteed(self):
        service, revisions = snapshots()
        with self.assertRaisesRegex(MODULE.Blocked, "rollback_revision_not_available"):
            MODULE.select_plan(SERVICE, service, revisions[-1:], PROMOTED, ROLLBACK)

    def test_no_delete_if_rollback_not_previous(self):
        service, revisions = snapshots()
        with self.assertRaisesRegex(MODULE.Blocked, "newest_two_do_not_match"):
            MODULE.select_plan(SERVICE, service, revisions, PROMOTED, NAMES[0])


if __name__ == "__main__":
    unittest.main()
