#!/usr/bin/env python3
"""RUA-02B one-shot candidate diagnostic; no production traffic promotion.

Uses the already-approved P0-V Google service identities and bearer creation
path; provider calls are bounded to one per project, no retry.
"""
import json
import subprocess
import sys
import time
import uuid

from p0v_gateway_formal_release import EXPECTED, MODEL, id_token, http_code

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
SERVICE = "omniagent-agent-gateway"
TAG = "rua02b-usage"
REVISION = "omniagent-agent-gateway-00107-doy"
SYNTHETIC_OWNER = "00000000-0000-4000-8000-000000000001"


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()


def snapshot():
    doc = json.loads(command("gcloud", "run", "services", "describe", SERVICE,
        "--project=" + PROJECT, "--region=" + REGION, "--format=json"))
    routes = doc["status"]["traffic"]
    active = [x for x in routes if x.get("percent", 0) > 0]
    candidate = [x for x in routes if x.get("tag") == TAG and x.get("percent", 0) == 0]
    if len(active) != 1 or active[0].get("percent") != 100 or len(candidate) != 1:
        raise RuntimeError("rua02b_traffic_changed_BLOCKED")
    if candidate[0].get("revisionName") != REVISION:
        raise RuntimeError("rua02b_candidate_not_exact_BLOCKED")
    if active[0].get("revisionName") == REVISION:
        raise RuntimeError("rua02b_serving_candidate_unapproved_BLOCKED")
    service_url = doc["status"]["url"].rstrip("/")
    tagged_url = candidate[0]["url"].rstrip("/")
    if not service_url.startswith("https://") or not tagged_url.startswith("https://"):
        raise RuntimeError("rua02b_invalid_endpoint_BLOCKED")
    return active[0]["revisionName"], service_url, tagged_url


def event(request_id, project):
    sql = ("SELECT project || ':' || status || ':' || model || ':' || "
           "COALESCE(provider_tokens::text,'NULL') FROM omni_gateway.router_usage_events "
           "WHERE request_id='" + request_id + "'::uuid AND project='" + project + "'")
    remote = ("sudo docker exec -u postgres janus-postgres "
              "psql -X -A -t -v ON_ERROR_STOP=1 -d omniagent_gateway -c " +
              json.dumps(sql))
    return command("gcloud", "compute", "ssh", "janus-postgres-dev",
        "--project=" + PROJECT, "--zone=us-central1-a",
        "--tunnel-through-iap", "--quiet", "--command=" + remote).splitlines()


def run():
    serving, audience, tagged = snapshot()
    print("rua02b_canary_revision=PINNED_0_PERCENT", flush=True)
    evidence = []
    for project in ("life-assistant", "market-mart", "omniagent"):
        request_id = str(uuid.uuid4())
        token = id_token(audience, project)
        body = dict(project=project, ownerId=SYNTHETIC_OWNER, requestId=request_id,
                    model=MODEL, prompt="Reply exactly OK.")
        status, answer = http_code(tagged + "/v1/gemini/execute", body, token)
        if (status != 200 or answer.get("status") != "completed"
            or answer.get("project") != project or answer.get("requestId") != request_id
            or answer.get("model") != MODEL or not (answer.get("result") or {}).get("text")):
            raise RuntimeError("rua02b_authorized_inference_" + project + "=BLOCKED")
        print("rua02b_model_" + project + "=PASS", flush=True)
        swapped = dict(body, project="omniagent" if project != "omniagent" else "life-assistant")
        denied, denied_body = http_code(tagged + "/v1/gemini/execute", swapped, token)
        if denied != 403 or denied_body.get("error") != "caller_project_mismatch":
            raise RuntimeError("rua02b_cross_project_" + project + "=BLOCKED")
        print("rua02b_project_isolation_" + project + "=PASS", flush=True)
        rows = []
        for _ in range(5):
            rows = event(request_id, project)
            if rows:
                break
            time.sleep(2)
        if len(rows) != 1 or not rows[0].startswith(project + ":completed:" + MODEL + ":"):
            raise RuntimeError("rua02b_event_" + project + "=NOT_VERIFIED")
        print("rua02b_db_event_" + project + "=PASS", flush=True)
        evidence.append(dict(project=project, request_id=request_id, status="PASS"))
    again, _, _ = snapshot()
    if again != serving:
        raise RuntimeError("rua02b_production_serving_changed_BLOCKED")
    print("rua02b_formal_gateway_traffic=UNCHANGED_100_PERCENT", flush=True)
    print("rua02b_test_owner=KNOWN_SYNTHETIC_NOT_A_HUMAN", flush=True)
    print("rua02b_candidate_3_project_end_to_end=PASS", flush=True)


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        # Fail without logging token, prompt, DB URL, or upstream payloads.
        print("rua02b_candidate_canary=BLOCKED:" + str(exc)[:120], file=sys.stderr)
        sys.exit(1)
