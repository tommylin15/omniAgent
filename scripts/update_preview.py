"""Update only the fixed preview route, with guarded recovery and sanitized evidence."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from verify_preview_route import validate

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
SERVICE = "omniagent-chat"
FIXED_URL = "https://preview---omniagent-chat-2oo7qbkd5q-uc.a.run.app"


def gcloud(*args):
    result = subprocess.run(["gcloud", *args, "--project=" + PROJECT, "--region=" + REGION],
                            capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError("gcloud_failed")
    return result.stdout


def snapshot():
    return json.loads(gcloud("run", "services", "describe", SERVICE, "--format=json"))


def routing(document):
    return sorted((r.get("revisionName"), r.get("tag", ""), r.get("percent", 0), r.get("url", ""))
                  for r in document["status"]["traffic"])


def preview(document):
    rows = [r for r in document["status"]["traffic"] if r.get("tag") == "preview"]
    if len(rows) > 1:
        raise RuntimeError("ambiguous_preview")
    return rows[0].get("revisionName") if rows else None


def check_source(sha):
    result = subprocess.run(["git", "ls-remote", "https://github.com/tommylin15/omniAgent.git", "refs/heads/main"],
                            capture_output=True, text=True, timeout=30)
    if result.returncode or result.stdout.split()[:1] != [sha]:
        raise RuntimeError("stale_source")


def check_revision(candidate, sha, digest, before):
    if before["status"].get("latestReadyRevisionName") != candidate:
        raise RuntimeError("stale_revision")
    tags = [r for r in before["status"]["traffic"] if r.get("tag") == "ghcr-" + sha[:12]
            and r.get("revisionName") == candidate and not r.get("percent", 0)]
    revision = json.loads(gcloud("run", "revisions", "describe", candidate, "--format=json"))
    ready = any(c.get("type") == "Ready" and c.get("status") == "True" for c in revision["status"]["conditions"])
    if len(tags) != 1 or not ready or not revision["status"].get("imageDigest", "").endswith("@" + digest):
        raise RuntimeError("revision_digest_or_ready_mismatch")


def update_tag(revision):
    change = "--update-tags=preview=" + revision if revision else "--remove-tags=preview"
    gcloud("run", "services", "update-traffic", SERVICE, change, "--quiet")


def probe(url):
    for path, expected in [("/health", 200), ("/ready", 200), ("/", 200), ("/main.dart.js", 200), ("/v1/threads", 401)]:
        try:
            with urlopen(url + path, timeout=35) as response:
                status = response.status
        except HTTPError as error:
            status = error.code
            error.close()
        if status != expected:
            raise RuntimeError("probe_failed")


def run(candidate, sha, digest):
    evidence = {"source_sha": sha, "chat_revision": candidate, "image_digest": digest,
                "fixed_preview": FIXED_URL, "validation": "FAIL", "recovery": "NOT_NEEDED",
                "production_promotion": "NOT_PERFORMED"}
    before = None
    attempted = False
    try:
        before = snapshot()
        evidence["preview_before"] = preview(before)
        check_source(sha)
        check_revision(candidate, sha, digest, before)
        fresh = snapshot()
        if routing(fresh) != routing(before) or fresh["spec"]["template"] != before["spec"]["template"]:
            raise RuntimeError("pre_update_drift")
        check_source(sha)
        attempted = True
        update_tag(candidate)
        after = snapshot()
        url = validate(before, after, candidate).rstrip("/")
        if url != FIXED_URL:
            raise RuntimeError("unexpected_preview_url")
        evidence["preview_after"] = preview(after)
        probe(url)
        validate(before, snapshot(), candidate)
        evidence.update(validation="PASS", formal_traffic_and_config="PASS")
    except Exception as error:
        evidence["error_class"] = type(error).__name__
        if attempted and before is not None:
            try:
                current = snapshot()
                evidence["preview_after"] = preview(current)
                if routing(current) == routing(before) and current["spec"]["template"] == before["spec"]["template"]:
                    evidence["recovery"] = "NOT_NEEDED"
                else:
                    try:
                        validate(before, current, candidate)
                    except (ValueError, KeyError):
                        evidence["recovery"] = "BLOCKED"
                        return evidence
                    evidence["recovery"] = "FAIL"
                    update_tag(preview(before))
                    restored = snapshot()
                    if routing(restored) != routing(before) or restored["spec"]["template"] != before["spec"]["template"]:
                        raise RuntimeError("restore_readback_failed")
                    if preview(before):
                        probe(FIXED_URL)
                    evidence.update(recovery="PASS", preview_after=preview(restored))
            except Exception:
                evidence["recovery"] = "FAIL"
    return evidence


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--release-sha", required=True)
    parser.add_argument("--digest", required=True)
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"omniagent-chat-[a-z0-9-]+", args.candidate) or not re.fullmatch(r"[a-f0-9]{40}", args.release_sha) or not re.fullmatch(r"sha256:[a-f0-9]{64}", args.digest):
        parser.error("invalid release binding")
    result = run(args.candidate, args.release_sha, args.digest)
    Path(args.evidence).write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))
    raise SystemExit(0 if result["validation"] == "PASS" else 1)
