"""RUA-02B existing bundle merge: preserve previous credentials and fail closed."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location("rua_bundle",
 Path(__file__).parents[1]/"infra/gcp/merge-router-usage-bundle.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

HOST="10.2.0.3"
def dsn(role):
    return f"postgresql://omniagent_usage_{role}:somepw@{HOST}:5432/omniagent_gateway?sslmode=require"
BUNDLE={"chat_database_url":f"postgresql://omniagent_chat_app:chatpw@{HOST}:5432/omniagent_chat?sslmode=require",
        "gemini_api_key":"gemini-existing","openrouter_api_key":"router-existing",
        "mcp_owner_signing_key":"key"*32,"other_option":True}
CERT="-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n"

class ExistingBundle(unittest.TestCase):
    def test_preserves_original_secrets_exactly(self):
        updated=module.merge(BUNDLE,dsn("writer"),dsn("reader"),CERT,HOST)
        for k,v in BUNDLE.items(): self.assertEqual(updated[k],v)
        self.assertEqual(updated["router_usage"],{
          "writer_database_url":dsn("writer"),"reader_database_url":dsn("reader"),
          "ca_pem":CERT,"tls_servername":"janus-postgres-dev"})
        self.assertNotIn("router_usage", BUNDLE)

    def test_refuses_overwrite_and_credential_role_confusion(self):
        with self.assertRaises(ValueError):
            module.merge(module.merge(BUNDLE,dsn("writer"),dsn("reader"),CERT,HOST),
                         dsn("writer"),dsn("reader"),CERT,HOST)
        for w,r in [(dsn("reader"),dsn("writer")),
                    (dsn("writer").replace(HOST,"8.8.8.8"),dsn("reader")),
                    (dsn("writer"),dsn("reader").replace("sslmode=require","sslmode=disable"))]:
            with self.assertRaises(ValueError):
                module.merge(BUNDLE,w,r,CERT,HOST)

    def test_invalid_original_contract_is_rejected(self):
        with self.assertRaises(ValueError):
            module.merge({**BUNDLE,"mcp_owner_signing_key":""},
                         dsn("writer"),dsn("reader"),CERT,HOST)
        with self.assertRaises(ValueError):
            module.merge(BUNDLE,dsn("writer"),dsn("reader"),CERT,HOST,"wrong.example")

if __name__=="__main__": unittest.main()
