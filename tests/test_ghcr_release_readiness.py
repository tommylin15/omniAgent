"""Non-billable, fully mocked formal release gate and GHCR fallback evidence."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location("ghcr_release_readiness",
    Path("scripts/ghcr_release_readiness.py"))
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
HEAD="78225a7f23b3722c03cde1a28ccd2d132f5ef466"

def fixture():
    services={}
    revisions={}
    for name in gate.SERVICES:
        rev=name+"-99999-candidate"
        back=name+"-99998-fallback"
        serving=name+"-99997-serving"
        primary="sha256:"+"a"*64
        fb=gate.FALLBACK_DIGEST[name]
        services[name]={
            "status":{"traffic":[
                {"revisionName":serving,"percent":100},
                {"revisionName":rev,"tag":"ghcr-"+HEAD[:12],"percent":0},
                {"revisionName":back,"tag":"ghcr-"+gate.FALLBACK_SHA[:12],"percent":0}]},
            "spec":{"template":{"spec":{"containers":[{"image":
                "ghcr.io/tommylin15/"+name+"@"+primary}]}}}}
        for suffix,digest in ((rev,primary),(back,fb)):
            revisions[suffix]={
                "status":{"conditions":[{"type":"Ready","status":"True"}]},
                "spec":{"containers":[{"image":"ghcr.io/tommylin15/"+name+"@"+digest,
                                       "env":[]}]}}
    return services,revisions

class ReleaseReadiness(unittest.TestCase):
    def test_safety_preflight_never_means_formal_release(self):
        services,revisions=fixture()
        result=gate.audit(HEAD,services,revisions,lambda name,version:"ENABLED")
        self.assertEqual(result["technical_preflight"],"PASS")
        self.assertEqual(result["formal_release_gate"],"BLOCKED_MISSING_LIVE_APP_ACCEPTANCE")
        self.assertFalse(result["production_traffic_mutated"])
        self.assertEqual(len(result["services"]),3)

    def test_missing_candidate_or_fallback_is_blocked(self):
        for tag in ("ghcr-"+HEAD[:12],"ghcr-"+gate.FALLBACK_SHA[:12]):
            services,revisions=fixture()
            for row in services["omniagent-chat"]["status"]["traffic"]:
                if row.get("tag")==tag: row["tag"]="changed"
            with self.assertRaises(gate.Blocked):
                gate.audit(HEAD,services,revisions,lambda n,v:"ENABLED")

    def test_changed_production_traffic_blocks(self):
        services,revisions=fixture()
        services["omniagent-chat"]["status"]["traffic"][0]["percent"]=90
        with self.assertRaises(gate.Blocked):
            gate.audit(HEAD,services,revisions,lambda n,v:"ENABLED")

    def test_bad_image_digests_fail_closed(self):
        services,revisions=fixture()
        revisions["omniagent-chat-99998-fallback"]["spec"]["containers"][0]["image"]="ghcr.io/tommylin15/omniagent-chat@sha256:"+"b"*64
        with self.assertRaisesRegex(gate.Blocked,"fallback_digest"):
            gate.audit(HEAD,services,revisions,lambda n,v:"ENABLED")
        services,revisions=fixture()
        services["omniagent-chat"]["spec"]["template"]["spec"]["containers"][0]["image"]="ghcr.io/tommylin15/omniagent-chat@sha256:"+"b"*64
        with self.assertRaisesRegex(gate.Blocked,"candidate_template_digest"):
            gate.audit(HEAD,services,revisions,lambda n,v:"ENABLED")

    def test_not_ready_and_revoked_secret_block(self):
        services,revisions=fixture()
        revisions["omniagent-chat-99998-fallback"]["status"]["conditions"][0]["status"]="False"
        with self.assertRaisesRegex(gate.Blocked,"not_ready"):
            gate.audit(HEAD,services,revisions,lambda n,v:"ENABLED")
        services,revisions=fixture()
        revisions["omniagent-chat-99999-candidate"]["spec"]["containers"][0]["env"]=[
            {"name":"BACKEND_SECRET","valueFrom":{"secretKeyRef":{"name":"approved","key":"latest"}}}]
        with self.assertRaisesRegex(gate.Blocked,"not_enabled"):
            gate.audit(HEAD,services,revisions,lambda n,v:"DISABLED")

    def test_never_enable_model_or_byok_without_acceptance(self):
        for setting in ("CHAT_DISPATCH_ENABLED","CHAT_BYOK_MANAGEMENT_ENABLED"):
            services,revisions=fixture()
            revisions["omniagent-chat-99999-candidate"]["spec"]["containers"][0]["env"]=[
                {"name":setting,"value":"true"}]
            with self.assertRaisesRegex(gate.Blocked,"unapproved"):
                gate.audit(HEAD,services,revisions,lambda n,v:"ENABLED")

    def test_secret_volumes_must_be_enabled_for_candidate_and_fallback(self):
        for target in ("omniagent-chat-99999-candidate",
                       "omniagent-chat-99998-fallback"):
            services, revisions = fixture()
            revisions[target]["spec"]["volumes"] = [{
                "name": "provider-credentials",
                "secret": {"secretName": "approved-provider",
                           "items": [{"key": "3", "path": "provider.json"}]}
            }]
            checks = []
            def read_secret(name, version):
                checks.append((name, version))
                return "DISABLED"
            with self.assertRaisesRegex(gate.Blocked, "not_enabled"):
                gate.audit(HEAD, services, revisions, read_secret)
            self.assertEqual(checks, [("approved-provider", "3")])

    def test_secret_volume_latest_and_invalid_reference(self):
        services, revisions = fixture()
        volume = {"name": "provider", "secret": {"secretName": "approved-provider"}}
        revisions["omniagent-chat-99999-candidate"]["spec"]["volumes"] = [volume]
        checks = []
        def read_secret(name, version):
            checks.append((name, version))
            return "ENABLED"
        gate.audit(HEAD, services, revisions, read_secret)
        self.assertEqual(checks, [("approved-provider", "latest")])
        volume["secret"]["items"] = [{"key": "not-a-version", "path": "x"}]
        with self.assertRaisesRegex(gate.Blocked, "invalid_secret_reference"):
            gate.audit(HEAD, services, revisions, read_secret)

    def test_uuid_free_config_prevents_cross_project_inference(self):
        services,revisions=fixture()
        services["omniagent-chat"]["status"]["traffic"][0]["revisionName"]=""
        # A missing active revision must not be silently accepted.
        with self.assertRaises(gate.Blocked):
            gate.audit(HEAD,services,revisions,lambda n,v:"ENABLED")

if __name__=="__main__":
    unittest.main()
