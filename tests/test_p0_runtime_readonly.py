import unittest
from scripts.p0_runtime_readonly import inspect
SHA="a"*40

def mk(tag, extra=None, one=False):
    env=extra or {}
    return {"status":{"url":"https://service.example.com","traffic":[{"tag":tag,"revisionName":"ready","percent":0,"url":"https://candidate.example.com"}]},
        "spec":{"template":{"metadata":{"annotations":{"autoscaling.knative.dev/maxScale":"1" if one else "3"}},
           "spec":{"containers":[{"env":[{"name":k,"value":v} for k,v in env.items()]}]}}}}

class RuntimeInventory(unittest.TestCase):
    def test_no_secrets_or_identifiers_written_and_gate_disabled(self):
        sha=SHA;tag="ghcr-"+sha[:12]
        secret="super-secret-owner-credential"
        services={
            "omniagent-chat":mk(tag,{"CHAT_DISPATCH_ENABLED":"false",
                "CHAT_DISPATCH_APPROVED_OWNER_IDS":"aabbccdd-1111-2222-3333-444444444444",
                "CHAT_DISPATCH_ENTITLEMENTS_JSON":'[{"credentialMode":"platform"}]',
                "CHAT_GATEWAY_URL":"https://candidate.example.com",
                "CHAT_GATEWAY_AUDIENCE":"https://service.example.com",
                "OMNIAGENT_BUNDLE":secret}),
            "omniagent-agent-gateway":mk(tag,{"CODEX_OWNER_SECRETS":secret},one=True),
            "omniagent-shared-codex":mk(tag)}
        result=inspect(sha,services)
        self.assertEqual(result["live_dispatch_gate"],"BLOCKED_RUNTIME_CONFIGURATION")
        self.assertEqual(result["approved_owner_id_count"],1)
        self.assertEqual(result["credential_payload_reads"],"NONE")
        self.assertNotIn(secret,str(result))
        self.assertNotIn("aabbccdd",str(result))
        services["omniagent-chat"]["spec"]["template"]["spec"]["containers"][0]["env"][0]["value"]="true"
        self.assertEqual(inspect(sha,services)["live_dispatch_gate"],"CONFIGURED_NOT_TESTED")
    def test_rejects_unverified_candidate(self):
        services={name:mk("other-tag") for name in ("omniagent-chat","omniagent-agent-gateway","omniagent-shared-codex")}
        with self.assertRaises(ValueError): inspect(SHA,services)
if __name__=="__main__":unittest.main()
