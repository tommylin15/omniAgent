"""Fail-closed tests for the Owner-authorized retain-ten Cloud Run plan."""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import p0v_owner_legacy_retention as target

def fixture(svc):
    size=target.EXPECTED_COUNTS[svc]
    names=[f"{svc}-{i:05d}-abc" for i in range(1,size+1)]
    names[-1]=target.KNOWN_ACTIVE[svc]
    day=datetime(2026,10,1,tzinfo=timezone.utc)
    revs=[{"metadata":{"name":x,"creationTimestamp":(day+timedelta(minutes=i)).isoformat()}}
          for i,x in enumerate(names)]
    routes=[{"revisionName":names[0],"percent":0,"tag":"preview"},
            {"revisionName":names[1],"percent":0,"tag":"ghcr-old"},
            {"revisionName":names[-1],"percent":100}]
    service={"status":{"traffic":routes,"url":"https://example.a.run.app"},
             "spec":{"template":{"spec":{"containers":[{"image":"pinned"}]}}}}
    return service,revs,names

def fake_rev(name,svc):
    env=[{"name":"GEMINI_SHARED_EXECUTION_ENABLED","value":"true"},
         {"name":"GEMINI_SHARED_MODEL","value":"gemini-3.5-flash-lite"}]
    if svc=="omniagent-chat":
        env=[{"name":"CHAT_DISPATCH_ENABLED","value":"false"}]
    return {"spec":{"serviceAccountName":"ci@example",
                    "containers":[{"image":"ghcr.io/owner/app@sha256:"+
                                    target.EXPECTED_DIGEST_PREFIX[svc]+"0"*52,
                                    "env":env}]},
            "status":{"conditions":[{"type":"Ready","status":"True"}]}}

class TenRetentionTests(unittest.TestCase):
    def test_keeps_exact_ten_and_explicit_fallback(self):
        for svc in target.SERVICES:
            service,revs,names=fixture(svc)
            with self.subTest(svc=svc),patch.object(target,"fallback_guard",return_value=True):
                p=target.planning(svc,service,revs,fake_rev)
            self.assertEqual(len(p.keep),10)
            self.assertEqual(len(p.delete),target.EXPECTED_COUNTS[svc]-10)
            self.assertIn(target.KNOWN_ACTIVE[svc],p.keep)
            self.assertIn(p.fallback,p.keep)
            self.assertIn("preview",p.remove_tags)
    def test_bad_count_fails_closed(self):
        svc="omniagent-agent-gateway"
        service,revs,_=fixture(svc)
        with self.assertRaisesRegex(target.Blocked,"approved_revision_count_changed"):
            target.planning(svc,service,revs[:-1],fake_rev)
    def test_no_verified_fallback_fails_closed(self):
        svc="omniagent-agent-gateway"
        service,revs,_=fixture(svc)
        with patch.object(target,"fallback_guard",return_value=False):
            with self.assertRaisesRegex(target.Blocked,"no_viable_rollback_within_newest_ten"):
                target.planning(svc,service,revs,fake_rev)
    def test_wrong_serving_image_fails_closed(self):
        svc="omniagent-chat"
        service,revs,_=fixture(svc)
        with self.assertRaisesRegex(target.Blocked,"formal_image_digest_drift"):
            target.planning(svc,service,revs,lambda n,s:{"spec":{"containers":[{"image":"mutable"}]}})
if __name__=="__main__":
    unittest.main()
