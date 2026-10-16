#!/usr/bin/env python3
"""Read-only, redact-by-construction P0 runtime inventory from Cloud Run metadata.
Never outputs environment values, Owner IDs, secret paths, tokens or URLs.
"""
import json
import re
import sys
from pathlib import Path

SERVICES = ("omniagent-chat", "omniagent-agent-gateway", "omniagent-shared-codex")
SHA = re.compile(r"^[0-9a-f]{40}$")
UUID = re.compile(r"^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")

def environment(service):
    container = (((service.get("spec") or {}).get("template") or {})
                 .get("spec") or {}).get("containers") or []
    if len(container) != 1:
        raise ValueError("unexpected container count")
    rows = container[0].get("env") or []
    result = {}
    for row in rows:
        name = row.get("name")
        if not isinstance(name, str) or name in result:
            raise ValueError("duplicate or invalid env name")
        result[name] = row
    return result

def supplied(env, name):
    row = env.get(name) or {}
    return isinstance(row.get("value"), str) and bool(row.get("value")) or bool(row.get("valueFrom"))

def value(env, name):
    data = (env.get(name) or {}).get("value")
    return data if isinstance(data, str) else ""

def candidate(service, tag):
    rows = (service.get("status") or {}).get("traffic") or []
    matched = [row for row in rows if row.get("tag") == tag and row.get("revisionName") and
               row.get("percent", 0) == 0]
    if len(matched) != 1 or not str(matched[0].get("url", "")).startswith("https://"):
        raise ValueError("verified zero-percent candidate tag missing")
    return matched[0]["url"]

def inspect(sha, services):
    if not SHA.fullmatch(sha) or set(services) != set(SERVICES):
        raise ValueError("invalid source or service scope")
    tag = "ghcr-" + sha[:12]
    urls = {name: candidate(services[name], tag) for name in SERVICES}
    chat = environment(services["omniagent-chat"])
    gateway = environment(services["omniagent-agent-gateway"])
    owner_raw = value(chat, "CHAT_DISPATCH_APPROVED_OWNER_IDS")
    owners = [x.strip() for x in owner_raw.split(",") if x.strip()]
    valid_owners = bool(owners) and len(owners) == len(set(owners)) and all(UUID.fullmatch(x) for x in owners)
    ent_raw = value(chat, "CHAT_DISPATCH_ENTITLEMENTS_JSON")
    try:
        entitlements = json.loads(ent_raw)
        valid_entitlements = (isinstance(entitlements, list) and bool(entitlements) and
                              all(isinstance(row, dict) and row.get("credentialMode") == "platform"
                                  for row in entitlements))
    except (ValueError, TypeError):
        valid_entitlements, entitlements = False, []
    signed_config = (supplied(chat, "OMNIAGENT_BUNDLE") and
                     value(chat, "CHAT_GATEWAY_URL").rstrip("/") == urls["omniagent-agent-gateway"].rstrip("/") and
                     value(chat, "CHAT_GATEWAY_AUDIENCE").rstrip("/") ==
                     (services["omniagent-agent-gateway"].get("status") or {}).get("url", "").rstrip("/"))
    gateway_annotations = (((services["omniagent-agent-gateway"].get("spec") or {})
                           .get("template") or {}).get("metadata") or {}).get("annotations") or {}
    max_instances = gateway_annotations.get("autoscaling.knative.dev/maxScale")
    dispatcher = value(chat, "CHAT_DISPATCH_ENABLED") == "true"
    ready = (dispatcher and valid_owners and valid_entitlements and signed_config and
             supplied(gateway, "CODEX_OWNER_SECRETS") and max_instances == "1")
    return {
        "sha": sha,
        "source": "current_same_sha_ghcr_signed_candidate_smoke",
        "chat_candidate": "READY_ZERO_TRAFFIC",
        "gateway_candidate": "READY_ZERO_TRAFFIC",
        "shared_candidate": "READY_ZERO_TRAFFIC",
        "chat_dispatch": "ENABLED" if dispatcher else "DISABLED",
        "approved_owner_id_count": len(owners) if valid_owners else 0,
        "owner_id_format": "PASS" if valid_owners else "MISSING_OR_INVALID",
        "model_entitlement_count": len(entitlements) if valid_entitlements else 0,
        "model_entitlements": "CONFIGURED" if valid_entitlements else "MISSING_OR_INVALID",
        "gateway_signed_route": "CONFIGURED" if signed_config else "NOT_CONFIGURED",
        "gateway_owner_codex_secrets": "PRESENT_REFERENCE_OR_VALUE" if supplied(gateway, "CODEX_OWNER_SECRETS") else "NOT_CONFIGURED",
        "gateway_one_instance": "VERIFIED_SETTING" if max_instances == "1" else "NOT_VERIFIED",
        "oauth_client": "PRESENT" if supplied(chat, "OMNIAGENT_GOOGLE_CLIENT_ID") else "MISSING",
        "chat_internal_auth": "PRESENT" if all(supplied(chat, n) for n in
            ("CHAT_INTERNAL_AUDIENCE", "CHAT_INTERNAL_ALLOWED_EMAILS")) else "MISSING",
        "owner_live_inference": "NOT_VERIFIED",
        "provider_calls": "NONE",
        "credential_payload_reads": "NONE",
        "database_writes": "NONE",
        "cloud_run_mutations": "NONE",
        "live_dispatch_gate": "CONFIGURED_NOT_TESTED" if ready else "BLOCKED_RUNTIME_CONFIGURATION"
    }

def main(argv):
    if len(argv) != 6:
        raise SystemExit("usage: inventory.py SHA chat.json gateway.json shared.json output.json")
    sha, chat, gateway, shared, output = argv[1:]
    services = {name:json.loads(Path(path).read_text(encoding="utf-8"))
                for name, path in zip(SERVICES, (chat, gateway, shared))}
    result = inspect(sha, services)
    Path(output).write_text(json.dumps(result, indent=2, sort_keys=True)+"\n", encoding="utf-8")
    print(json.dumps(result, sort_keys=True))

if __name__ == "__main__":
    main(sys.argv)
