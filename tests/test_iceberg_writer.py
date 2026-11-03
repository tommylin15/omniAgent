"""Source tests; no installed Iceberg dependency or external resource is needed by these fakes."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("omniagent_iceberg_writer", Path(__file__).parents[1] / "services/archive-writer/app.py")
writer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = writer
SPEC.loader.exec_module(writer)
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
EXPORT = "33333333-3333-4333-8333-333333333333"
TABLE = "approved.archive.envelopes"
PREFIX = "gs://approved-own-bucket/archive/"
PAYLOAD = b'{"report":"hello"}'
DIGEST = hashlib.sha256(PAYLOAD).hexdigest()


def config():
    return writer.Config(True, "https://writer-123.asia-east1.run.app", {},
                         {OWNER: {"table": TABLE, "identifier": "archive.envelopes", "gcsPrefix": PREFIX}}, {})


def request():
    return {"operation": "commit", "exportId": EXPORT, "ownerId": OWNER, "sourceSha256": DIGEST,
            "table": TABLE, "contentType": "application/json", "bytesBase64": base64.b64encode(PAYLOAD).decode()}


class FakeConnection:
    def __init__(self):
        self.row = None
        self.calls = []
        self.current = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def execute(self, sql, args):
        self.calls.append(sql)
        if "pg_try_advisory_lock" in sql:
            self.current = {"locked": True}
        elif sql.startswith("INSERT") and self.row is None:
            self.row = dict(export_id=args[0], owner_id=args[1], source_sha256=args[2], table_name=args[3], content_type=args[4], state="prepared")
        elif sql.startswith("SELECT *"):
            self.current = self.row if self.row and self.row["owner_id"] == args[0] else None
        elif "SET state='uncertain'" in sql:
            self.row["state"] = "uncertain"
        elif "SET state='verified'" in sql:
            self.row["state"] = "verified"
        return self

    def fetchone(self):
        return self.current.copy() if self.current else None


class WriterTests(unittest.TestCase):
    def test_off_by_default_and_no_implicit_resources(self):
        self.assertFalse(writer.parse_config({}).enabled)
        with self.assertRaises(ValueError):
            writer.parse_config({"ICEBERG_WRITER_ENABLED": "true"})

    def test_validates_owner_digest_json_and_exact_fields(self):
        envelope = writer.validate_commit(request(), config())
        self.assertEqual(json.loads(envelope["payload_json"])["text"].encode(), PAYLOAD)
        self.assertEqual(json.loads(envelope["payload_json"])["contentType"], "application/json")
        for change in [{"ownerId": OTHER}, {"sourceSha256": "0" * 64}, {"contentType": "text/html"}, {"arbitrary": True}]:
            with self.assertRaises((ValueError, PermissionError)):
                writer.validate_commit({**request(), **change}, config())
        invalid = b'not-json'
        with self.assertRaises(ValueError):
            writer.validate_commit({**request(), "bytesBase64": base64.b64encode(invalid).decode(), "sourceSha256": hashlib.sha256(invalid).hexdigest()}, config())

    def test_plain_text_preserves_original_utf8_bytes_and_digest_in_canonical_envelope(self):
        payload = '進度\n"quoted"\x00'.encode()
        value = {**request(), "contentType": "text/plain", "bytesBase64": base64.b64encode(payload).decode(), "sourceSha256": hashlib.sha256(payload).hexdigest()}
        envelope = writer.validate_commit(value, config())
        decoded = json.loads(envelope["payload_json"])
        self.assertEqual(decoded, {"contentType": "text/plain", "text": payload.decode()})
        self.assertEqual(hashlib.sha256(decoded["text"].encode()).hexdigest(), value["sourceSha256"])
        with self.assertRaises(UnicodeError):
            bad = b'\xff'
            writer.validate_commit({**value, "bytesBase64": base64.b64encode(bad).decode(), "sourceSha256": hashlib.sha256(bad).hexdigest()}, config())

    def test_lost_commit_reconciles_without_second_append(self):
        conn = FakeConnection()
        class LostResponseWriter(writer.IcebergWriter):
            committed = False
            appends = 0
            def table(self, _owner):
                def append(*_args, **_kwargs):
                    self.appends += 1
                    self.committed = True
                    raise OSError("response lost after commit")
                return SimpleNamespace(schema=lambda: SimpleNamespace(as_arrow=lambda: None), append=append)
            def receipt(self, *_):
                return {"format": "iceberg", "snapshotId": "42"} if self.committed else None
        service = LostResponseWriter(config(), connect=lambda: conn)
        fake_arrow = SimpleNamespace(Table=SimpleNamespace(from_pylist=lambda *_a, **_k: None))
        with patch.dict(sys.modules, {"pyarrow": fake_arrow}):
            with self.assertRaises(OSError):
                service.export(OWNER, EXPORT, writer.validate_commit(request(), config()))
        self.assertEqual(conn.row["state"], "uncertain")
        self.assertEqual(service.export(OWNER, EXPORT)["snapshotId"], "42")
        self.assertEqual(service.appends, 1)
        self.assertEqual(conn.row["state"], "verified")

    def test_absent_uncertain_snapshot_never_blindly_reappends(self):
        conn = FakeConnection()
        conn.row = dict(export_id=EXPORT, owner_id=OWNER, source_sha256=DIGEST, table_name=TABLE, content_type="application/json", state="uncertain")
        class Uncertain(writer.IcebergWriter):
            def table(self, _):
                return object()
            def receipt(self, *_):
                return None
        service = Uncertain(config(), connect=lambda: conn)
        with self.assertRaises(writer.ReconcileRequired):
            service.export(OWNER, EXPORT, writer.validate_commit(request(), config()))
        self.assertFalse(any("SET state='uncertain'" in sql for sql in conn.calls))

    def test_readback_checks_snapshot_storage_scope_and_payload_digest(self):
        envelope = writer.validate_commit(request(), config())
        summary = {"omniagent.export_id": EXPORT, "omniagent.owner_id": OWNER, "omniagent.source_sha256": DIGEST}
        snapshot = SimpleNamespace(summary=summary, snapshot_id=42, manifest_list=PREFIX + "metadata/snap.avro")
        row = dict(envelope)
        scan = SimpleNamespace(plan_files=lambda: [SimpleNamespace(file=SimpleNamespace(file_size_in_bytes=100, file_path=PREFIX + "data/file.parquet"))],
                               to_arrow=lambda: SimpleNamespace(to_pylist=lambda: [row]))
        table = SimpleNamespace(snapshots=lambda: [snapshot], scan=lambda **_: scan)
        expressions = SimpleNamespace(And=lambda *x: x, EqualTo=lambda *x: x)
        with patch.dict(sys.modules, {"pyiceberg": SimpleNamespace(), "pyiceberg.expressions": expressions}):
            receipt = writer.IcebergWriter(config()).receipt(table, OWNER, EXPORT, DIGEST)
            self.assertEqual(receipt["snapshotId"], "42")
            row["payload_json"] = "tampered"
            with self.assertRaises(writer.ReconcileRequired):
                writer.IcebergWriter(config()).receipt(table, OWNER, EXPORT, DIGEST)
            snapshot.manifest_list = "gs://other-project-bucket/metadata/snapshot.avro"
            with self.assertRaises(writer.ReconcileRequired):
                writer.IcebergWriter(config()).receipt(table, OWNER, EXPORT, DIGEST)


if __name__ == "__main__":
    unittest.main()
