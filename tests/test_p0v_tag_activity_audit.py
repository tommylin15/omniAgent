"""Cloud Run tagged-host activity evidence; simulated only, zero GCP operations."""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"scripts"))
from p0v_tag_activity_audit import inspect, tag_host

def row(tag="ghcr-aabbccddeeff", url=None):
    service="omniagent-agent-gateway"
    return {"service":service,"tag":tag,"revision":service+"-00075-abc",
            "classification":"GHCR_CANDIDATE__REVIEW_REQUIRED",
            "reference_files_in_omniagent_only":[],
            "url":url if url is not None else
              "https://"+tag+"---"+service+"-2oo7qbkd5q-uc.a.run.app"}

class ActivityTest(unittest.TestCase):
    def test_matching_host_allows_readonly_query(self):
        self.assertEqual(tag_host(row()),
                         "ghcr-aabbccddeeff---omniagent-agent-gateway-2oo7qbkd5q-uc.a.run.app")
        self.assertIsNone(tag_host(row(url="https://attacker.example.org/")))
        self.assertIsNone(tag_host(row(url="http://ghcr-aabbccddeeff---omniagent-agent-gateway-x.a.run.app")))
        self.assertIsNone(tag_host(row(url="https://ghcr-other---omniagent-agent-gateway-x.a.run.app")))
    def test_observed_requests_never_automatically_allow_retirement(self):
        current=datetime(2026,10,14,12,0,tzinfo=timezone.utc)
        evidence=inspect([row()], current, lambda *args:{
            "state":"REQUEST_OBSERVED","observed":True,"last_seen_utc":"2026-10-13T12:00:00Z"})
        self.assertEqual(evidence["count"],1)
        self.assertTrue(evidence["tags"][0]["observed_request"])
        self.assertFalse(evidence["tags"][0]["retirement_authorized"])
        self.assertFalse(evidence["tags"][0]["safe_to_delete"])
        self.assertNotIn("url",evidence["tags"][0])
        self.assertEqual(evidence["tags_authorized_for_retirement"],0)
    def test_no_request_is_not_proof_unused(self):
        out=inspect([row()],datetime(2026,10,14,12,0,tzinfo=timezone.utc),
            lambda *args: {"state":"NOT_OBSERVED_NOT_PROOF_UNUSED",
                           "observed":False,"last_seen_utc":None})
        self.assertFalse(out["tags"][0]["safe_to_delete"])
        self.assertEqual(out["tags"][0]["activity"],"NOT_OBSERVED_NOT_PROOF_UNUSED")
    def test_missing_tag_url_fails_closed_without_a_logging_call(self):
        def fail(*args): raise AssertionError("must not query")
        out=inspect([row(url="")],datetime(2026,10,14,12,0,tzinfo=timezone.utc),fail)
        self.assertEqual(out["tags"][0]["activity"],"TAG_URL_NOT_VERIFIABLE")
        self.assertIsNone(out["tags"][0]["observed_request"])

if __name__=="__main__":
    unittest.main()
