"""Own bounded Iceberg writer. No table/catalog creation, purge, or arbitrary SQL."""
import base64
import hashlib
import json
import os
import re
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from uuid import UUID

MAX_BYTES = 16_777_216
MAX_ENVELOPE_BYTES = MAX_BYTES * 6 + 256
MAX_REQUEST = 22_372_000
FIELDS = ("owner_id", "export_id", "source_sha256", "content_type", "payload_json")


class ReconcileRequired(Exception):
    pass


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


def uuid(value):
    if not isinstance(value, str) or str(UUID(value)) != value.lower():
        raise ValueError("invalid identity")
    return value.lower()


def json_object(raw, limit=131_072):
    if not isinstance(raw, str) or len(raw.encode()) > limit:
        raise ValueError("configuration exceeds bound")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("expected object")
    return value


def service_origin(raw):
    u = urlparse(raw)
    if (u.scheme != "https" or u.username or u.password or u.port or
            u.path not in ("", "/") or u.query or u.fragment or
            not re.fullmatch(r"[a-z0-9-]+\.[a-z0-9-]+\.run\.app|[a-z0-9-]+\.a\.run\.app", u.hostname or "")):
        raise ValueError("invalid approved service audience")
    return f"https://{u.hostname}"


@dataclass(frozen=True)
class Config:
    enabled: bool
    audience: str = ""
    catalog: dict | None = None
    owners: dict | None = None
    callers: dict | None = None
    dsn: str = ""
    ca_path: str = ""


def parse_config(env):
    if env.get("ICEBERG_WRITER_ENABLED") != "true":
        return Config(False)
    audience = service_origin(env.get("ICEBERG_WRITER_AUDIENCE", ""))
    catalog = json_object(env.get("ICEBERG_CATALOG_JSON", ""))
    if (catalog.get("approved") is not True or
            catalog.get("uri") != "https://biglake.googleapis.com/iceberg/v1/restcatalog" or
            not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,62}", catalog.get("name", "")) or
            not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", catalog.get("project", "")) or
            not re.fullmatch(r"gs://[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]", catalog.get("warehouse", ""))):
        raise ValueError("approved existing BigLake catalog configuration required")
    owners = json_object(env.get("ICEBERG_OWNER_TABLES_JSON", ""))
    callers = json_object(env.get("ICEBERG_CALLER_GRANTS_JSON", ""))
    if not owners or not callers:
        raise ValueError("explicit owner and caller scopes required")
    for owner, grant in owners.items():
        if uuid(owner) != owner or not isinstance(grant, dict):
            raise ValueError("invalid owner grant")
        table = grant.get("table", "")
        identifier = grant.get("identifier", "")
        if (not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,62}\.[A-Za-z][A-Za-z0-9_]{0,62}", identifier) or
                table != catalog["name"] + "." + identifier or
                not isinstance(grant.get("gcsPrefix"), str) or
                not grant["gcsPrefix"].startswith(catalog["warehouse"] + "/") or
                not re.fullmatch(r"gs://[a-z0-9._-]+/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+/", grant["gcsPrefix"])):
            raise ValueError("invalid approved table or own GCS prefix")
    for email, allowed in callers.items():
        if (not re.fullmatch(r"[-a-z0-9]+@[-a-z0-9]+\.iam\.gserviceaccount\.com", email) or
                not isinstance(allowed, list) or not allowed or len(allowed) > 100 or
                any(owner not in owners for owner in allowed)):
            raise ValueError("invalid caller owner grant")
    bundle = json_object(env.get("OMNIAGENT_BUNDLE", "{}"))
    dsn = bundle.get("chat_database_url") or env.get("CHAT_DATABASE_URL", "")
    parsed = urlparse(dsn)
    if parsed.scheme not in ("postgres", "postgresql") or parsed.path != "/omniagent_chat" or not parsed.hostname:
        raise ValueError("own omniagent_chat database required")
    ca = env.get("ICEBERG_DATABASE_SSLROOTCERT", "")
    if not os.path.isabs(ca):
        raise ValueError("mounted PostgreSQL CA path required")
    return Config(True, audience, catalog, owners, callers, dsn, ca)


def validate_commit(value, config):
    allowed = {"operation", "exportId", "ownerId", "sourceSha256", "table", "contentType", "bytesBase64"}
    if not isinstance(value, dict) or set(value) != allowed or value.get("operation") != "commit":
        raise ValueError("invalid export fields")
    owner, export_id = uuid(value["ownerId"]), uuid(value["exportId"])
    grant = config.owners.get(owner)
    if not grant or value["table"] != grant["table"]:
        raise PermissionError("owner table not granted")
    if not isinstance(value["sourceSha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", value["sourceSha256"]):
        raise ValueError("invalid digest")
    encoded = value["bytesBase64"]
    if not isinstance(encoded, str) or len(encoded) > ((MAX_BYTES + 2) // 3) * 4:
        raise ValueError("payload too large")
    data = base64.b64decode(encoded, validate=True)
    if len(data) > MAX_BYTES or base64.b64encode(data).decode() != encoded or hashlib.sha256(data).hexdigest() != value["sourceSha256"]:
        raise ValueError("payload digest mismatch")
    if not isinstance(value["contentType"], str) or not re.fullmatch(r"text/plain|application/(?:json|[a-z0-9_.+-]+\+json)", value["contentType"]):
        raise ValueError("archive accepts UTF-8 text/plain and JSON artifacts only; original hot artifact is retained")
    payload = data.decode("utf-8")
    if value["contentType"] != "text/plain":
        json.loads(payload, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("non-finite JSON")))
    canonical_envelope = json.dumps({"contentType": value["contentType"], "text": payload}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if len(canonical_envelope.encode()) > MAX_ENVELOPE_BYTES:
        raise ValueError("archive envelope exceeds bound")
    return {"owner_id": owner, "export_id": export_id, "source_sha256": value["sourceSha256"],
            "content_type": value["contentType"], "payload_json": canonical_envelope}


class IcebergWriter:
    def __init__(self, config, connect=None, load=None):
        self.config = config
        self._connect = connect
        self._load = load

    def connect(self):
        if self._connect:
            return self._connect()
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(self.config.dsn, autocommit=True, row_factory=dict_row,
                               sslmode="verify-full", sslrootcert=self.config.ca_path,
                               connect_timeout=5, options="-c statement_timeout=5000 -c lock_timeout=1000")

    def table(self, owner):
        grant = self.config.owners.get(owner)
        if not grant:
            raise PermissionError("owner not granted")
        if self._load:
            table = self._load(grant["identifier"])
        else:
            from pyiceberg.catalog import load_catalog
            c = self.config.catalog
            catalog = load_catalog(c["name"], **{"type": "rest", "uri": c["uri"], "warehouse": c["warehouse"],
                                                   "auth": {"type": "google"}, "header.x-goog-user-project": c["project"],
                                                   "header.X-Iceberg-Access-Delegation": "", "py-io-impl": "pyiceberg.io.fsspec.FsspecFileIO"})
            table = catalog.load_table(grant["identifier"])
        location = table.location().rstrip("/") + "/"
        if not location.startswith(grant["gcsPrefix"]) or not table.metadata_location.startswith(grant["gcsPrefix"]):
            raise PermissionError("table is outside approved own GCS scope")
        import pyarrow as pa
        schema = table.schema().as_arrow()
        if tuple(schema.names) != FIELDS or any(f.nullable or not (pa.types.is_string(f.type) or pa.types.is_large_string(f.type)) for f in schema):
            raise ValueError("existing Iceberg table must have the exact required envelope schema")
        return table

    def receipt(self, table, owner, export_id, digest):
        from pyiceberg.expressions import And, EqualTo
        snapshots = table.snapshots()
        if len(snapshots) > 1000:
            raise ReconcileRequired("snapshot metadata exceeds bounded reconciliation")
        matches = [s for s in snapshots if s.summary and s.summary["omniagent.export_id"] == export_id and s.summary["omniagent.owner_id"] == owner]
        if not matches:
            return None
        if len(matches) != 1 or matches[0].summary["omniagent.source_sha256"] != digest:
            raise ReconcileRequired("duplicate or conflicting export snapshots")
        snapshot = matches[0]
        if snapshot.snapshot_id <= 0 or not snapshot.manifest_list.startswith(self.config.owners[owner]["gcsPrefix"]):
            raise ReconcileRequired("snapshot is outside approved own storage scope")
        scan = table.scan(snapshot_id=snapshot.snapshot_id, row_filter=And(EqualTo("owner_id", owner), EqualTo("export_id", export_id)), selected_fields=FIELDS, limit=2)
        files = list(scan.plan_files())
        if (len(files) > 4 or sum(task.file.file_size_in_bytes for task in files) > 67_108_864 or
                any(not task.file.file_path.startswith(self.config.owners[owner]["gcsPrefix"]) for task in files)):
            raise ReconcileRequired("snapshot readback exceeds bounded file scan")
        rows = scan.to_arrow().to_pylist()
        if len(rows) != 1:
            raise ReconcileRequired("snapshot export row is absent or duplicated")
        row = rows[0]
        payload = row.get("payload_json")
        if (row.get("owner_id") != owner or row.get("export_id") != export_id or row.get("source_sha256") != digest or
                not isinstance(payload, str) or len(payload.encode()) > MAX_ENVELOPE_BYTES):
            raise ReconcileRequired("snapshot row digest or owner verification failed")
        try:
            envelope = json.loads(payload)
            if (not isinstance(envelope, dict) or set(envelope) != {"contentType", "text"} or
                    envelope["contentType"] != row.get("content_type") or not isinstance(envelope["text"], str) or
                    len(envelope["text"].encode()) > MAX_BYTES or hashlib.sha256(envelope["text"].encode()).hexdigest() != digest or
                    json.dumps(envelope, ensure_ascii=False, sort_keys=True, separators=(",", ":")) != payload):
                raise ValueError("invalid canonical source envelope")
        except (ValueError, TypeError, UnicodeError) as error:
            raise ReconcileRequired("snapshot source envelope digest verification failed") from error
        return {"format": "iceberg", "exportId": export_id, "ownerId": owner, "sourceSha256": digest,
                "table": self.config.owners[owner]["table"], "snapshotId": str(snapshot.snapshot_id), "committed": True, "recordCount": 1}

    def export(self, owner, export_id, envelope=None):
        with self.connect() as conn:
            # Session lock spans committed checkpoints and catalog I/O. A crash releases it automatically.
            locked = conn.execute("SELECT pg_try_advisory_lock(hashtextextended(%s,0)) AS locked", ("omniagent-iceberg:" + export_id,)).fetchone()["locked"]
            if not locked:
                raise Conflict("export is already in progress")
            try:
                if envelope:
                    conn.execute("""INSERT INTO omni_chat.iceberg_writer_exports(export_id,owner_id,source_sha256,table_name,content_type,state)
                        VALUES(%s,%s,%s,%s,%s,'prepared') ON CONFLICT(export_id) DO NOTHING""",
                                 (export_id, owner, envelope["source_sha256"], self.config.owners[owner]["table"], envelope["content_type"]))
                row = conn.execute("SELECT * FROM omni_chat.iceberg_writer_exports WHERE owner_id=%s AND export_id=%s", (owner, export_id)).fetchone()
                if not row:
                    raise NotFound()
                if row["table_name"] != self.config.owners[owner]["table"] or (envelope and (row["source_sha256"] != envelope["source_sha256"] or row["content_type"] != envelope["content_type"])):
                    raise Conflict("export idempotency conflict")
                receipt = self.receipt(self.table(owner), owner, export_id, row["source_sha256"])
                if receipt:
                    conn.execute("UPDATE omni_chat.iceberg_writer_exports SET state='verified',snapshot_receipt=%s::jsonb,updated_at=now() WHERE owner_id=%s AND export_id=%s", (json.dumps(receipt), owner, export_id))
                    return receipt
                if row["state"] != "prepared":
                    # Absence after an uncertain catalog commit is never permission to append again.
                    raise ReconcileRequired("commit is uncertain or snapshot expired; manual reconciliation required")
                if not envelope:
                    raise NotFound()
                import pyarrow as pa
                table = self.table(owner)
                # This checkpoint commits before append, even when the HTTP request subsequently disconnects.
                conn.execute("UPDATE omni_chat.iceberg_writer_exports SET state='uncertain',updated_at=now() WHERE owner_id=%s AND export_id=%s", (owner, export_id))
                table.append(pa.Table.from_pylist([envelope], schema=table.schema().as_arrow()), snapshot_properties={
                    "omniagent.export_id": export_id, "omniagent.owner_id": owner, "omniagent.source_sha256": envelope["source_sha256"]})
                receipt = self.receipt(self.table(owner), owner, export_id, envelope["source_sha256"])
                if receipt is None:
                    raise ReconcileRequired("catalog did not confirm committed export")
                conn.execute("UPDATE omni_chat.iceberg_writer_exports SET state='verified',snapshot_receipt=%s::jsonb,updated_at=now() WHERE owner_id=%s AND export_id=%s", (json.dumps(receipt), owner, export_id))
                return receipt
            finally:
                conn.execute("SELECT pg_advisory_unlock(hashtextextended(%s,0))", ("omniagent-iceberg:" + export_id,))


def make_handler(config, writer, verify=None):
    slots = threading.BoundedSemaphore(2)

    def authenticate(token, owner):
        if verify:
            claims = verify(token, config.audience)
        else:
            from google.auth.transport.requests import Request
            from google.oauth2 import id_token
            claims = id_token.verify_oauth2_token(token, Request(), config.audience)
        email = claims.get("email")
        if (claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com") or not claims.get("sub") or
                claims.get("email_verified") is not True or owner not in config.callers.get(email, [])):
            raise PermissionError("caller owner scope denied")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, value):
            data = json.dumps(value, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/healthz":
                self.reply(200, {"status": "ok", "enabled": config.enabled})
                return
            self.dispatch(False)

        def do_POST(self):
            self.dispatch(True)

        def dispatch(self, commit):
            if not config.enabled:
                self.reply(503, {"error": "iceberg_writer_disabled"})
                return
            if not slots.acquire(blocking=False):
                self.reply(429, {"error": "writer_capacity_bound"})
                return
            try:
                self.connection.settimeout(15)
                path = urlparse(self.path)
                if commit:
                    if path.path != "/v1/iceberg/exports" or path.query:
                        raise NotFound()
                    length = self.headers.get("Content-Length", "")
                    if self.headers.get("Transfer-Encoding") or not length.isdigit() or not 0 < int(length) <= MAX_REQUEST:
                        raise ValueError("bounded content length required")
                    body = self.rfile.read(int(length))
                    if len(body) != int(length):
                        raise ValueError("truncated body")
                    value = json.loads(body)
                    if not isinstance(value, dict):
                        raise ValueError("export body must be an object")
                    owner, export_id = uuid(value.get("ownerId")), uuid(value.get("exportId"))
                    envelope = None
                else:
                    match = re.fullmatch(r"/v1/iceberg/exports/([a-fA-F0-9-]{36})", path.path)
                    query = parse_qs(path.query, strict_parsing=True)
                    if not match or set(query) != {"ownerId"} or len(query["ownerId"]) != 1:
                        raise NotFound()
                    owner, export_id = uuid(query["ownerId"][0]), uuid(match.group(1))
                    envelope = None
                authorization = self.headers.get("Authorization", "")
                if not authorization.startswith("Bearer ") or len(authorization) > 16_384:
                    raise PermissionError("identity token required")
                authenticate(authorization[7:], owner)
                if commit:
                    if self.headers.get("Idempotency-Key") != export_id:
                        raise ValueError("idempotency header mismatch")
                    envelope = validate_commit(value, config)
                self.reply(200, writer.export(owner, export_id, envelope))
            except PermissionError:
                self.reply(403, {"error": "caller_or_owner_not_granted"})
            except NotFound:
                self.reply(404, {"error": "export_not_found"})
            except (Conflict, ReconcileRequired):
                self.reply(409, {"error": "export_requires_reconciliation"})
            except (ValueError, TypeError, KeyError, UnicodeError):
                self.reply(422, {"error": "invalid_export_request"})
            except Exception:
                self.reply(503, {"error": "catalog_or_commit_outcome_unavailable"})
            finally:
                slots.release()

    return Handler


if __name__ == "__main__":
    config = parse_config(os.environ)
    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), make_handler(config, IcebergWriter(config)))
    server.daemon_threads = True
    server.serve_forever()
