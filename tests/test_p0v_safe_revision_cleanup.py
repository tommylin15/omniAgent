"""P0-V safe reduction: never sacrifice live routes, tagged URLs or previous Gateway."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import p0v_safe_revision_cleanup as safe

SVC=safe.GATEWAY
def fixture(extra_tags=False):
    names=[f"{SVC}-{n:05d}-abc" for n in range(55,81)]
    names[5]=safe.GATEWAY_FALLBACK
    names[-1]=safe.KNOWN_ACTIVE[SVC]
    revs=[{"metadata":{"name":name,"creationTimestamp":f"2026-10-{(i//24)+1:02d}T{i%24:02d}:00:00Z"}}
          for i,name in enumerate(names)]
    routes=[{"revisionName":safe.KNOWN_ACTIVE[SVC],"percent":100},
            {"revisionName":names[0],"percent":0,"tag":"p0v-market2048-old"},
            {"revisionName":names[1],"percent":0,"tag":"preview"}]
    if extra_tags:
        routes.extend({"revisionName":name,"percent":0,"tag":f"kept-{i}"}
                      for i,name in enumerate(names[2:18],2))
    doc={"status":{"traffic":routes,"latestCreatedRevisionName":names[-1],
                   "latestReadyRevisionName":names[-1]},
         "spec":{"template":{"spec":{"containers":[{"env":[{"name":"GEMINI_SHARED_EXECUTION_ENABLED","value":"true"}]}]}}}}
    return doc,revs,names
class SafeCleanupTests(unittest.TestCase):
    def test_preserves_active_previous_formal_and_all_tags(self):
        doc,revs,names=fixture()
        p=safe.plan(SVC,doc,revs)
        self.assertIn(safe.KNOWN_ACTIVE[SVC],p.keep)
        self.assertIn(safe.GATEWAY_FALLBACK,p.keep)
        self.assertIn(names[0],p.keep)
        self.assertIn(names[1],p.keep)
        self.assertFalse(set(p.keep)&set(p.delete))
        self.assertEqual(set(p.keep)|set(p.delete),set(names))
        self.assertEqual(len(p.keep),10)
    def test_more_than_ten_protected_tags_must_stay(self):
        doc,revs,names=fixture(extra_tags=True)
        p=safe.plan(SVC,doc,revs)
        self.assertGreater(len(p.keep),10)
        self.assertTrue(set(names[:18]).issubset(set(p.keep)))
        self.assertFalse(safe.receipt(p)["ten_policy_possible_without_tag_retirement"])
    def test_no_deletion_when_other_revision_receives_traffic(self):
        doc,revs,names=fixture()
        doc["status"]["traffic"][0]["percent"]=90
        doc["status"]["traffic"].append({"revisionName":names[-2],"percent":10})
        with self.assertRaisesRegex(safe.Blocked,"serving_not_exactly_100"):
            safe.plan(SVC,doc,revs)
    def test_fails_closed_on_changed_formal_revision(self):
        doc,revs,_=fixture()
        doc["status"]["traffic"][0]["revisionName"]="omniagent-agent-gateway-00090-zxy"
        with self.assertRaisesRegex(safe.Blocked,"formal_serving_drift"):
            safe.plan(SVC,doc,revs)
    def test_tags_must_be_unique_and_unchanged(self):
        doc,revs,names=fixture()
        original=safe.signature(SVC,doc,revs)
        doc["status"]["traffic"].append({"revisionName":names[2],"percent":0,"tag":"other-tag"})
        self.assertNotEqual(original,safe.signature(SVC,doc,revs))
        doc["status"]["traffic"][-1]["tag"]="preview"
        with self.assertRaisesRegex(safe.Blocked,"invalid_or_duplicate_tag"):
            safe.plan(SVC,doc,revs)
    def test_requires_true_gateway_feature_flag(self):
        doc,revs,_=fixture()
        doc["spec"]["template"]["spec"]["containers"][0]["env"][0]["value"]="false"
        with self.assertRaisesRegex(safe.Blocked,"gateway_gemini_not_enabled"):
            safe.plan(SVC,doc,revs)
    def test_bad_revision_metadata_fails_closed(self):
        doc,revs,_=fixture()
        revs[0]["metadata"]["creationTimestamp"]=None
        with self.assertRaisesRegex(safe.Blocked,"missing_revision_creation_timestamp"):
            safe.plan(SVC,doc,revs)
    def test_dryrun_does_not_delete(self):
        from unittest.mock import patch
        doc,revs,_=fixture()
        with patch.object(safe,"snapshot",return_value=(doc,revs)),patch.object(safe.subprocess,"run") as runner:
            receipt=safe.process(SVC,False)
        runner.assert_not_called()
        self.assertEqual(receipt["deleted"],[])
        self.assertEqual(receipt["status"],"DRY_RUN")
if __name__=="__main__":
    unittest.main()
