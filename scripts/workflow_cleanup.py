#!/usr/bin/env python3
"""Identify deprecated workflows that can be safely removed."""

# Keep these (core functionality)
KEEP = {
    # New unified workflows
    '_shared-setup.yml',
    'ci.yml',
    'auto-release.yml',
    'maintenance.yml',
    # Essential existing (until fully migrated)
    'omniagent-ghcr-publish.yml',
    'omniagent-ghcr-cloudrun-candidate.yml',
    'omniagent-ghcr-current-candidate-smoke.yml',
}

# Remove these (replaced by unified workflows)
REMOVE = {
    # Replaced by ci.yml
    'node-core.yml',
    'flutter-agent-app.yml',
    # Replaced by auto-release.yml
    'omniagent-ghcr-release.yml',
    'omniagent-ghcr-one-shot-release.yml',
    # Replaced by maintenance.yml
    'omniagent-cloudrun-retain-ten.yml',
    'omniagent-ghcr-revision-retention-inventory.yml',
    'omniagent-chat-runtime-inventory.yml',
    'omniagent-v2-readonly-diagnostic.yml',
    'omniagent-legacy-assets-readonly.yml',
    'omniagent-gcp-retirement-inventory.yml',
    'omniagent-cloudbuild-status-readonly.yml',
    'shared-codex-cloud-run-inventory.yml',
    'shared-codex-post-retirement.yml',
    # Redundant diagnostic/probe workflows
    'omniagent-chat-vpc-probe.yml',
    'omniagent-postgres-firewall-probe.yml',
    'omniagent-postgres-readiness-diagnostic.yml',
    'omniagent-ghcr-secret-reference-diagnostic.yml',
    'omniagent-v2-shadow-bundle-check.yml',
    'omniagent-v2-shadow-failure-readonly.yml',
    'omniagent-v2-shadow-gate-readonly.yml',
    'omniagent-gemini-502-diagnostic-candidate-readonly.yml',
    # One-time or obsolete
    'omniagent-v2-manual.yml',
    'omniagent-postgres-bootstrap.yml',
    'shared-codex-resource-bootstrap.yml',
    'shared-codex-auth-diagnostic.yml',
    'project-hygiene.yml',
}

if __name__ == '__main__':
    from pathlib import Path
    workflows = Path('.github/workflows')
    all_files = {f.name for f in workflows.glob('*.yml')}
    
    print(f"Total: {len(all_files)} workflows")
    print(f"Keep: {len(KEEP)}")
    print(f"Remove: {len(REMOVE)}")
    print(f"Review: {len(all_files - KEEP - REMOVE)}")
    
    print("\n=== TO REMOVE ===")
    for f in sorted(REMOVE & all_files):
        print(f"  {f}")
    
    print("\n=== NEED REVIEW ===")
    for f in sorted(all_files - KEEP - REMOVE):
        print(f"  {f}")
