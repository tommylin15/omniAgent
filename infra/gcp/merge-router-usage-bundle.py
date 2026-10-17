#!/usr/bin/env python3
"""RUA-02B: append scoped usage credentials to existing omniagent-bundle.

Never replaces provider/Chat signing credentials, never prints secret values.
Intended for a one-shot WIF runner with private 0600 input/output files.
"""
import ipaddress
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit, unquote, parse_qs


def _check_dsn(dsn, user, hostname):
    if not isinstance(dsn, str):
        raise ValueError("invalid scoped usage DSN")
    try:
        url = urlsplit(dsn)
        host = ipaddress.ip_address(url.hostname or "")
    except (ValueError, TypeError):
        raise ValueError("invalid scoped usage DSN") from None
    if (url.scheme not in ("postgres", "postgresql")
        or not isinstance(host, ipaddress.IPv4Address)
        or not host.is_private or str(host) != hostname
        or unquote(url.username or "") != user
        or not url.password or url.path != "/omniagent_gateway"
        or (url.port or 5432) != 5432
        or parse_qs(url.query) != {"sslmode": ["require"]}
        or url.fragment):
        raise ValueError("invalid scoped usage DSN")


def merge(current, writer_dsn, reader_dsn, public_ca_pem, hostname,
          tls_servername="janus-postgres-dev"):
    if not isinstance(current, dict):
        raise ValueError("existing bundle must be an object")
    if "router_usage" in current:
        raise ValueError("existing RUA-02B bundle section must not be overwritten")
    if not isinstance(current.get("chat_database_url"), str):
        raise ValueError("existing Chat database contract is unavailable")
    chat = urlsplit(current["chat_database_url"])
    if chat.scheme not in ("postgres", "postgresql") or chat.path != "/omniagent_chat" or chat.username != "omniagent_chat_app" or chat.hostname != hostname:
        raise ValueError("existing Chat DB endpoint mismatch")
    for required in ("gemini_api_key", "openrouter_api_key", "mcp_owner_signing_key"):
        if not isinstance(current.get(required), str) or not current[required].strip():
            raise ValueError("existing bundle key missing")
    _check_dsn(writer_dsn, "omniagent_usage_writer", hostname)
    _check_dsn(reader_dsn, "omniagent_usage_reader", hostname)
    if not isinstance(public_ca_pem, str) or not public_ca_pem.startswith("-----BEGIN CERTIFICATE-----") or "-----END CERTIFICATE-----" not in public_ca_pem or len(public_ca_pem) > 16000:
        raise ValueError("invalid public PostgreSQL certificate")
    if tls_servername != "janus-postgres-dev":
        raise ValueError("unverified TLS server identity")
    result = dict(current)
    result["router_usage"] = {
        "writer_database_url": writer_dsn.strip(),
        "reader_database_url": reader_dsn.strip(),
        "ca_pem": public_ca_pem,
        "tls_servername": tls_servername
    }
    return result


def main():
    if len(sys.argv) != 7:
        raise SystemExit("usage: merge-router-usage-bundle.py OLD_JSON WRITER_DSN READER_DSN PUBLIC_CA DB_HOST OUTPUT")
    old, writer, reader, public_ca, host = (Path(value) for value in sys.argv[1:6])
    output = sys.argv[6]
    try:
        obj = merge(json.loads(old.read_text()), writer.read_text().strip(),
                    reader.read_text().strip(), public_ca.read_text(), host.read_text().strip())
        fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(obj, stream, separators=(",", ":"))
        print("rua02b_existing_bundle_merge=PASS")
        print("secret_contents_logged=NO")
    except (ValueError, OSError, json.JSONDecodeError) as e:
        raise SystemExit("rua02b_existing_bundle_merge=BLOCKED") from None


if __name__ == "__main__":
    main()
