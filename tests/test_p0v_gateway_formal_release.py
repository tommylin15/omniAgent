"""Fail-closed, isolated P0-V Gateway production release controls."""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import p0v_gateway_formal_release as release

class GatewayReleaseTests(unittest.TestCase):
    def test_single_formal_route_required(self):
        self.assertEqual(release.live({"status":{"traffic":[{"revisionName":"a","percent":100}]}}),"a")
        for traffic in ([],[{"revisionName":"a","percent":50}],[{"revisionName":"a","percent":50},{"revisionName":"b","percent":50}]):
            with self.assertRaises(release.Blocked):
                release.live({"status":{"traffic":traffic}})

    def test_three_fixed_callers_and_caps_are_not_configurable(self):
        flags=release.expected_flags("https://omniagent-agent-gateway-x.a.run.app")
        self.assertEqual(flags["GEMINI_SHARED_EXECUTION_ENABLED"],"true")
        self.assertEqual(flags["GEMINI_SHARED_MODEL"],"gemini-3.5-flash-lite")
        self.assertEqual(json.loads(flags["GEMINI_SHARED_CALLERS_JSON"]),release.EXPECTED)
        self.assertEqual(len(release.EXPECTED),3)
        self.assertEqual(set(release.FLAGS),set(flags))

    def test_no_activation_without_exact_confirmation_and_current_sha(self):
        sha="a"*40
        with tempfile.TemporaryDirectory() as temp:
            path=str(Path(temp)/"receipt.json")
            with patch.object(release,"preflight") as preflight, patch.object(release,"current_main") as current:
                rc=release.execute("activate","",sha,path)
                self.assertEqual(rc,1)
                preflight.assert_not_called()
                current.assert_not_called()
                self.assertFalse(json.loads(Path(path).read_text())["traffic_mutation_attempted"])

    def test_stale_main_fails_before_any_mutation(self):
        sha="a"*40
        with tempfile.TemporaryDirectory() as temp:
            path=str(Path(temp)/"receipt.json")
            with patch.object(release,"current_main",return_value="b"*40),patch.object(release,"preflight") as preflight:
                rc=release.execute("activate","ACTIVATE_P0V_GATEWAY_ONLY",sha,path)
                self.assertEqual(rc,1)
                preflight.assert_not_called()

    def test_preflight_is_pure_readonly(self):
        baseline={"before":"omniagent-agent-gateway-00060-vup",
                  "pilot":"omniagent-agent-gateway-00061-a", "others":{},
                  "audience":"https://omniagent-agent-gateway-x.a.run.app"}
        with tempfile.TemporaryDirectory() as temp:
            path=str(Path(temp)/"receipt.json")
            with patch.object(release,"preflight",return_value=baseline),patch.object(release,"publish") as publish,patch.object(release,"traffic") as traffic:
                self.assertEqual(release.execute("preflight","","",path),0)
                publish.assert_not_called()
                traffic.assert_not_called()
            self.assertEqual(json.loads(Path(path).read_text())["status"],"PREFLIGHT_PASS_NO_MUTATIONS")

    def test_protected_environment_cannot_change_existing_secret_or_identity(self):
        audience="https://omniagent-agent-gateway-x.a.run.app"
        shared=[{"name":k,"value":v} for k,v in release.expected_flags(audience).items()]
        def svc(env,identity="gateway@project"):
            return {"metadata":{"name":release.GATEWAY},"spec":{"template":{"spec":{
                "serviceAccountName":identity,"containers":[{"env":env}]}}}}
        before=svc([{"name":"GEMINI_API_KEY","valueFrom":{"secretKeyRef":{"name":"bundle","key":"2"}}}])
        after=svc(before["spec"]["template"]["spec"]["containers"][0]["env"]+shared)
        release.protected_same(before,after,audience)
        altered=svc([{"name":"GEMINI_API_KEY","valueFrom":{"secretKeyRef":{"name":"bundle","key":"3"}}}]+shared)
        with self.assertRaises(release.Blocked):
            release.protected_same(before,altered,audience)
        wrong_sa=svc(after["spec"]["template"]["spec"]["containers"][0]["env"],identity="other@project")
        with self.assertRaises(release.Blocked):
            release.protected_same(before,wrong_sa,audience)

    def test_signed_positive_failure_emergency_restores_prior_traffic(self):
        sha="a"*40
        baseline={"before":"omniagent-agent-gateway-00060-vup","pilot":"old",
                  "others":{},"snapshot":{},"audience":"https://omniagent-agent-gateway-x.a.run.app"}
        tag="p0v-formal-"+sha[:8]
        def snap():
            return {"status":{"traffic":[{"revisionName":"new" if calls else baseline["before"],"percent":100},
                       {"revisionName":"new","percent":0,"tag":tag,"url":"https://test.a.run.app"}]}}
        calls=[]
        def traffic(rev):
            calls.append(rev)
        with tempfile.TemporaryDirectory() as temp,patch.object(release,"current_main",return_value=sha),\
                patch.object(release,"preflight",return_value=baseline),patch.object(release,"publish",return_value="new"),\
                patch.object(release,"check_new"),patch.object(release,"service",side_effect=lambda _:snap()),\
                patch.object(release,"traffic",side_effect=traffic),patch.object(release,"smoke",side_effect=[None,release.Blocked("positive_gemini_smoke_failed")]),\
                patch.object(release,"check_others"),patch.object(release,"iam_check"),\
                patch.object(release,"revision",return_value={"status":{"conditions":[{"type":"Ready","status":"True"}]}}):
            path=str(Path(temp)/"receipt.json")
            self.assertEqual(release.execute("activate","ACTIVATE_P0V_GATEWAY_ONLY",sha,path),1)
            self.assertEqual(calls,["new",baseline["before"]])
            doc=json.loads(Path(path).read_text())
            self.assertEqual(doc["emergency_recovery"],"PASS")
            self.assertEqual(doc["status"],"BLOCKED")

if __name__ == "__main__":
    unittest.main()
