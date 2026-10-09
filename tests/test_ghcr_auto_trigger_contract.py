"""Regression checks for the production-safe GHCR auto-trigger chain.

These static checks complement, but never replace, actual GitHub Actions
workflow_run and Cloud Run evidence.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"


def workflow(name: str) -> str:
    return (WORKFLOWS / name).read_text(encoding="utf-8")


class GhcrAutomaticTriggerContractTest(unittest.TestCase):
    def test_source_push_runs_quality_and_three_image_publish(self):
        source = workflow("omniagent-ghcr-publish.yml")
        self.assertRegex(source, r"(?m)^on:\n  push:\n    branches: \[main\]")
        self.assertIn("- 'tests/**'", source)
        self.assertIn("needs: quality", source)
        for image in ("omniagent-chat", "omniagent-agent-gateway", "omniagent-shared-codex"):
            with self.subTest(image=image):
                self.assertIn("image: " + image, source)
        self.assertIn("ghcr_image_digest=PASS", source)

    def test_publish_success_automatically_starts_no_traffic_candidates(self):
        source = workflow("omniagent-ghcr-cloudrun-candidate.yml")
        self.assertRegex(source, r"(?m)^on:\n  workflow_run:")
        self.assertIn("workflows: ['omniAgent GHCR image publish']", source)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", source)
        self.assertIn("github.event.workflow_run.event == 'push'", source)
        self.assertIn("github.event.workflow_run.head_branch == 'main'", source)
        self.assertIn("--no-traffic", source)
        self.assertIn("traffic_preserved=PASS", source)

    def test_destroyed_gateway_legacy_secrets_are_removed_only_for_zero_percent_candidates(self):
        source = workflow("omniagent-ghcr-cloudrun-candidate.yml")
        preflight = source.index("name: Validate Secret versions and plan Gateway legacy detach")
        deploy = source.index("name: Deploy immutable public GHCR candidates with NO traffic")
        self.assertLess(preflight, deploy)
        for label in ("_AGENT_PROVIDER_BUNDLE", "MCP_OWNER_SIGNING_KEY",
                      "OMNIAGENT_PROVIDER_BUNDLE"):
            self.assertIn(label, source)
        self.assertIn('source==("omniagent-bundle","latest")', source)
        self.assertIn('and observed=="DESTROYED" and source_healthy', source)
        self.assertIn('candidate_secret_version_preflight=BLOCKED', source)
        self.assertIn('gcloud","secrets","versions","describe"', source)
        self.assertIn("raise SystemExit(1)", source)
        self.assertIn('--set-secrets="OMNIAGENT_PROVIDER_BUNDLE=omniagent-bundle:latest"', source)
        self.assertIn('GATEWAY_SECRET_REPLACEMENT_NOT_EXACT', source)
        self.assertIn('GATEWAY_TEMPLATE_SECRETS_NOT_EXACT', source)
        self.assertIn('if [[ "$svc" == "omniagent-agent-gateway" ]]; then', source)
        self.assertIn('Enforce the exactly preflight-approved single bundle.', source)
        self.assertIn('set(refs)!=(set(planned)|{"OMNIAGENT_PROVIDER_BUNDLE"})', source)
        self.assertIn("--no-traffic", source)
        self.assertIn('if protected(before,True)!=protected(after):', source)
        self.assertNotIn("gcloud secrets versions access", source)
        gateway = (ROOT / "services/agent-gateway/server.ts").read_text()
        self.assertIn('process.env.OMNIAGENT_PROVIDER_BUNDLE?.trim()', gateway)
        self.assertIn('MCP_OWNER_SIGNING_KEY: "mcp_owner_signing_key"', gateway)

    def test_nonzero_cli_result_requires_verified_immutable_ready_revision(self):
        source = workflow("omniagent-ghcr-cloudrun-candidate.yml")
        self.assertIn('|| deploy_rc=$?', source)
        self.assertIn('deploy_command_exit=$svc:$deploy_rc', source)
        self.assertIn('latestReadyRevisionName', source)
        self.assertIn('latestCreatedRevisionName', source)
        self.assertIn('observed!=sys.argv[4]', source)
        self.assertIn('if serving(before)!=serving(after)', source)
        self.assertIn('row.get("tag")==expected_tag', source)
        self.assertIn('len(tags)!=1', source)
        self.assertIn('deploy_cli_nonzero_but_new_ready_revision_readback=PASS', source)
        self.assertNotIn('|| true', source)

    def test_new_only_rollback_preflight_excludes_unusable_secret_versions(self):
        source = workflow("omniagent-ghcr-new-only-rollback-preflight.yml")
        self.assertIn('new_only_rollback_readiness=BLOCKED', source)
        self.assertIn('new_only_rollback_readiness=PASS', source)
        self.assertIn('if state!="ENABLED"', source)
        self.assertIn('FALLBACK_OR_PRIMARY_SECRET_NOT_ENABLED', source)
        self.assertIn('digest_verified', source)
        self.assertIn('legacy_rollback_dependency=NONE', source)
        self.assertIn('production_traffic_mutated=NO', source)
        self.assertNotIn('gcloud run services update-traffic', source)
        self.assertNotIn('gcloud run revisions delete', source)

    def test_candidate_success_automatically_starts_read_only_smoke(self):
        source = workflow("omniagent-ghcr-current-candidate-smoke.yml")
        self.assertRegex(source, r"(?m)^on:\n  workflow_run:")
        self.assertIn("workflows: ['omniAgent GHCR Cloud Run zero-traffic candidates']", source)
        self.assertNotIn("  push:", source)
        self.assertNotIn("  workflow_dispatch:", source)
        self.assertIn("github.event_name == 'workflow_run'", source)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", source)
        self.assertIn("github.event.workflow_run.head_branch == 'main'", source)
        self.assertIn("RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}", source)
        self.assertIn("current_ghcr_candidate_signed_smoke=PASS", source)
        self.assertIn("formal_traffic_preserved=PASS", source)


if __name__ == "__main__":
    unittest.main()
