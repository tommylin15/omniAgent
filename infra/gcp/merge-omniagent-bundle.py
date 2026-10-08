#!/usr/bin/env python3
"""One-time operator helper; reads file inputs, never prints secret values."""
import ipaddress
import json
import os
from pathlib import Path
import secrets
import sys
from urllib.parse import parse_qs, urlparse


def merge(current: object, dsn: str) -> dict:
    if not isinstance(current, dict):
        raise ValueError("existing omniAgent bundle must be a JSON object")
    data = dict(current)
    for key in ("gemini_api_key", "openrouter_api_key"):
        if not isinstance(data.get(key), str) or not data[key].strip():
            raise ValueError("existing bundle missing " + key)
    url = urlparse(dsn.strip())
    if (url.scheme not in ("postgres", "postgresql")
            or url.username != "omniagent_chat_app" or url.path != "/omniagent_chat"
            or not url.password or url.port not in (None, 5432)
            or parse_qs(url.query).get("sslmode") != ["require"]):
        raise ValueError("dedicated Chat database URL contract mismatch")
    try:
        if not ipaddress.ip_address(url.hostname).is_private:
            raise ValueError("database host must be private")
    except (ValueError, TypeError):
        raise ValueError("database host must be private") from None
    signing = data.get("mcp_owner_signing_key")
    if signing is None or signing == "":
        signing = secrets.token_hex(32)
    elif not isinstance(signing, str) or len(signing.strip()) < 32:
        raise ValueError("existing owner signing key is invalid; refusing silent rotation")
    data["mcp_owner_signing_key"] = signing
    data["chat_database_url"] = dsn.strip()
    return data


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: merge-omniagent-bundle.py OLD_JSON DB_DSN OUTPUT")
    old, dedicated, destination = map(Path, sys.argv[1:])
    try:
        bundle = merge(json.loads(old.read_text(encoding="utf-8")), dedicated.read_text(encoding="utf-8"))
        # Exclusive creation prevents overwriting any existing operator file.
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(bundle, stream, separators=(",", ":"))
        print("omniagent_bundle_merge=VALIDATED")
        print("secret_values=NOT_PRINTED")
    except (ValueError, json.JSONDecodeError):
        raise SystemExit("merge refused: bundle or DSN contract invalid (values suppressed)") from None


if __name__ == "__main__":
    main()
