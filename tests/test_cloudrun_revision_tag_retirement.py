"""No live Cloud Run tag mutation in unit tests. All GCP reads are mocked."""
from copy import deepcopy
import importlib
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
TAGGER=importlib.import_module("cloudrun_revision_tag_retirement")

SERVICE="omniagent-chat"
NAMES=[f"{SERVICE}-{i:05d}-abc" for i in range(1,13)]
PRIMARY=NAMES[-1]
FALLBACK=NAMES[-2]


def sample(with_old_tags=True):
    revs=[{"metadata":{"name":name,
           "creationTimestamp":f"2026-10-08T00:{i:02d}:00Z"}}
          for i,name in enumerate(NAMES,1)]
    traffic=[{"revisionName":PRIMARY,"percent":100,"tag":"ghcr-primary"},
             {"revisionName":FALLBACK,"percent":0,"tag":"ghcr-fallback"}]
    if with_old_tags:
        traffic += [{"revisionName":NAMES[0],"percent":0,"tag":"old-a"},
                    {"revisionName":NAMES[1],"percent":0,"tag":"old-b"}]
    return {"status":{"latestCreatedRevisionName":PRIMARY,
             "latestReadyRevisionName":PRIMARY,"traffic":traffic}},revs


class TagRetirementTest(unittest.TestCase):
    def test_only_old_tag_routes_are_planned_new_pair_retained(self):
        svc,revs=sample()
        plan=TAGGER.plan_tags(SERVICE,svc,revs,PRIMARY,FALLBACK)
        self.assertEqual(plan.remove_tags,("old-a","old-b"))
        self.assertIn(PRIMARY,plan.keep_revisions)
        self.assertIn(FALLBACK,plan.keep_revisions)
        self.assertEqual(len(plan.keep_revisions),10)

    def test_old_serving_revision_blocks_any_tag_removal(self):
        svc,revs=sample()
        svc["status"]["traffic"][0]["percent"]=0
        svc["status"]["traffic"].append(
            {"revisionName":NAMES[0],"percent":100})
        with self.assertRaises(TAGGER.Blocked):
            TAGGER.plan_tags(SERVICE,svc,revs,PRIMARY,FALLBACK)

    def test_incorrect_new_pair_or_latest_not_ready_blocks(self):
        svc,revs=sample()
        with self.assertRaises(TAGGER.Blocked):
            TAGGER.plan_tags(SERVICE,svc,revs,PRIMARY,NAMES[0])
        svc["status"]["latestReadyRevisionName"]=FALLBACK
        with self.assertRaises(TAGGER.Blocked):
            TAGGER.plan_tags(SERVICE,svc,revs,PRIMARY,FALLBACK)

    def test_duplicate_or_invalid_tag_blocks(self):
        svc,revs=sample()
        svc["status"]["traffic"].append(
            {"revisionName":NAMES[2],"percent":0,"tag":"old-a"})
        with self.assertRaisesRegex(TAGGER.Blocked,"duplicate_traffic_tag"):
            TAGGER.plan_tags(SERVICE,svc,revs,PRIMARY,FALLBACK)
        svc,revs=sample()
        svc["status"]["traffic"][-1]["tag"]="../unsafe"
        with self.assertRaisesRegex(TAGGER.Blocked,"unapproved_or_invalid_tag"):
            TAGGER.plan_tags(SERVICE,svc,revs,PRIMARY,FALLBACK)

    def test_dry_run_produces_receipt_without_gcloud_mutation(self):
        svc,revs=sample()
        with patch.object(TAGGER,"snapshots",return_value=(svc,revs)),patch.object(
                TAGGER.subprocess,"run") as command:
            receipt=TAGGER.retire(SERVICE,PRIMARY,FALLBACK,apply=False)
        command.assert_not_called()
        self.assertEqual(receipt["status"],"DRY_RUN")
        self.assertEqual(receipt["planned_tag_removals"],["old-a","old-b"])
        self.assertEqual(receipt["removed_tags"],[])

    def test_apply_removes_only_two_old_tags_and_checks_complete_readback(self):
        svc,revs=sample()
        after, _=sample(with_old_tags=False)
        with patch.object(TAGGER,"snapshots",side_effect=[
                (svc,revs),(deepcopy(svc),revs),(after,revs)
            ]),patch.object(TAGGER.subprocess,"run") as command:
            receipt=TAGGER.retire(SERVICE,PRIMARY,FALLBACK,apply=True)
        self.assertEqual(receipt["status"],"PASS")
        self.assertEqual(receipt["removed_tags"],["old-a","old-b"])
        argv=command.call_args.args[0]
        self.assertIn("--remove-tags=old-a,old-b",argv)
        self.assertNotIn("--clear-tags",argv)
        self.assertNotIn("--set-tags",argv)

    def test_stale_snapshot_blocks_before_any_mutation(self):
        svc,revs=sample()
        drift=deepcopy(svc)
        drift["status"]["traffic"][-1]["tag"]="different-old-tag"
        with patch.object(TAGGER,"snapshots",side_effect=[
                (svc,revs),(drift,revs)
            ]),patch.object(TAGGER.subprocess,"run") as command:
            with self.assertRaisesRegex(TAGGER.Blocked,"pre_tag_retirement_state_changed"):
                TAGGER.retire(SERVICE,PRIMARY,FALLBACK,apply=True)
        command.assert_not_called()

    def test_tag_readback_mismatch_blocks_false_success(self):
        svc,revs=sample()
        still_old=deepcopy(svc)
        with patch.object(TAGGER,"snapshots",side_effect=[
                (svc,revs),(deepcopy(svc),revs),(still_old,revs)
            ]),patch.object(TAGGER.subprocess,"run") as command:
            with self.assertRaisesRegex(TAGGER.Blocked,"post_tag_retirement_tag_readback_mismatch"):
                TAGGER.retire(SERVICE,PRIMARY,FALLBACK,apply=True)
        command.assert_called_once()


if __name__=="__main__":
    unittest.main()
