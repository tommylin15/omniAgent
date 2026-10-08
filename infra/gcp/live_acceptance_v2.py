"""Real candidate probes. Missing business or browser evidence stays BLOCKED."""
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
import uuid

from cicd_v2 import PROJECT, REGION, SERVICES, STATE, cloud_json, gcloud, recovery_route, save, service, store_object, traffic_percent


def provider_call(state):
    usage = state["usage"]
    if usage["provider_calls"] >= 5:
        raise RuntimeError("COST_LIMIT: maximum five live provider calls per SHA")
    usage["provider_calls"] += 1
    store_object("usage/" + state["sha"] + ".json", usage)


def request(url, path, token=None, body=None, headers=None, timeout=180):
    values = dict(headers or {})
    if token:
        values["Authorization"] = "Bearer " + token
    if body is not None:
        values["Content-Type"] = "application/json"
    req = urllib.request.Request(url + path, data=None if body is None else json.dumps(body).encode(), headers=values)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if "json" in response.headers.get("Content-Type", "") else raw.decode()
    except urllib.error.HTTPError as exc:
        return exc.code, None


def identity(email, audience):
    return gcloud("auth", "print-identity-token", "--impersonate-service-account=" + email,
        "--audiences=" + audience, "--include-email")


def require(status, expected):
    if status != expected:
        raise RuntimeError(f"HTTP {status}, expected {expected}")


def chat(state):
    row = state["services"]["chat"]
    url = row.get("candidate_url", row["url"])
    require(request(url, "/health")[0], 200)
    status, ready = request(url, "/ready")
    require(status, 200)
    if ready != {"status": "ready"}:
        raise RuntimeError("DB readiness payload mismatch")
    for path in ("/v1/threads", "/internal/v1/chat/events"):
        require(request(url, path, body={} if "internal" in path else None)[0], 401)
    require(request(url, "/v1/threads", token="forged")[0], 401)
    html_status, html = request(url, "/")
    require(html_status, 200)
    if "<html" not in html.lower() or "flutter_bootstrap.js" not in html:
        raise RuntimeError("Flutter bootstrap missing")
    for path in ("/flutter_bootstrap.js", "/main.dart.js"):
        require(request(url, path)[0], 200)
    state["gates"]["flutter"] = "PASS"

    # Real Google-signed distinct principals, not self-asserted owner IDs.
    accounts = ("omniagent-codex-chat-client", "omniagent-codex-life-client")
    tokens = [identity(f"{account}@{PROJECT}.iam.gserviceaccount.com", state["google_client_id"]) for account in accounts]
    threads = []
    owners = []
    for token in tokens:
        thread_id = "cicd-v2-" + uuid.uuid4().hex
        status, data = request(url, "/v1/threads", token, {"threadId": thread_id,
            "runtime": "gemini", "model": "gemini-2.5-flash", "assistantProfile": "default"},
            {"Idempotency-Key": thread_id})
        require(status, 201)
        owners.append(data["owner_id"])
        threads.append(thread_id)
        require(request(url, "/v1/threads/" + thread_id, token)[0], 200)
    if len(set(owners)) != 2:
        raise RuntimeError("Google principals share owner")
    for index in (0, 1):
        foreign = threads[1 - index]
        for path in (f"/v1/threads/{foreign}", f"/v1/threads/{foreign}/events"):
            require(request(url, path, tokens[index])[0], 404)
        require(request(url, f"/v1/threads/{foreign}/messages", tokens[index],
            {"content": "Isolation probe; no provider execution."}, {"Idempotency-Key": uuid.uuid4().hex})[0], 404)
    state["gates"]["chat"] = "PASS"
    state["chat_probe"] = {"google_signed_two_owner": "PASS", "api_db_auth_isolation": "PASS",
        "principal_kind": "service-account", "test_threads": threads,
        "note": "Only new probe threads were created; no existing data changed. No browser OAuth claim."}
    state["gates"]["browser_oauth"] = "BLOCKED: live browser Google sign-in with two human owners not evidenced"
    state["gates"]["chat_gateway_integration"] = "BLOCKED: durable dispatcher is unimplemented in active TODO"


def shared(state):
    row = state["services"]["shared"]
    url = row.get("candidate_url", row["url"])
    runtime = service(SERVICES["shared"])
    env = {e["name"]: e.get("value") for e in runtime["spec"]["template"]["spec"]["containers"][0]["env"]}
    callers = json.loads(env["SHARED_CODEX_CALLERS_JSON"])
    if set(callers) != {"market-mart", "life-assistant", "omniagent"}:
        raise RuntimeError("existing caller contract changed")
    policy = cloud_json("run", "services", "get-iam-policy", SERVICES["shared"], f"--region={REGION}")
    invokers = {member for b in policy.get("bindings", []) if b["role"] == "roles/run.invoker" for member in b["members"]}
    if invokers & {"allUsers", "allAuthenticatedUsers"} or not {"serviceAccount:" + a for a in callers.values()} <= invokers:
        raise RuntimeError("Shared Codex private IAM/caller mismatch")
    require(request(url, "/v1/codex/execute", body={})[0], 403)
    replies = []
    state["shared_probe"] = []
    for label, email in sorted(callers.items()):
        token = identity(email, row["url"])
        require(request(url, "/health", token)[0], 200)
        require(request(url, "/ready", token)[0], 200)
        # Supply a unique canary to one caller; other requests get no canary context.
        canary = "CANARY-" + uuid.uuid4().hex
        owner = str(uuid.uuid4())
        req_id = str(uuid.uuid4())
        body = {"project": label, "ownerId": owner, "requestId": req_id,
            "prompt": "Reply exactly READY. Do not use tools. " + canary}
        provider_call(state)
        status, reply = request(url, "/v1/codex/execute", token, body)
        require(status, 200)
        text = reply.get("result", {}).get("text", "")
        ids = reply.get("providerIds", {})
        if reply.get("status") != "completed" or reply.get("project") != label or reply.get("ownerId") != owner or reply.get("requestId") != req_id or not text.strip() or not ids.get("threadId") or not ids.get("turnId"):
            raise RuntimeError("real Codex reply contract failed")
        for previous in replies:
            if ids["threadId"] == previous["thread"] or previous["canary"] in text:
                raise RuntimeError("cross-request context/thread leak")
        replies.append({"thread": ids["threadId"], "canary": canary})
        for other in callers:
            if other != label:
                require(request(url, "/v1/codex/execute", token, {**body, "project": other})[0], 403)
        state["shared_probe"].append({"caller": label, "service_account": email, "status": 200,
            "output_sha256": hashlib.sha256(text.encode()).hexdigest(), "fresh_thread": True,
            "cross_project_denial": "PASS"})
        save(state)
    state["gates"]["shared"] = "PASS"


def gateway(state):
    row = state["services"]["gateway"]
    if not row.get("candidate_url") and "gateway" in state["components"]:
        raise RuntimeError(state["gates"].get("gateway", "Gateway candidate missing"))
    url = row.get("candidate_url", row["url"])
    require(request(url, "/health")[0], 403)
    # Use the existing approved Chat invoker, not a new IAM grant.
    token = identity(state["services"]["chat"]["runtime_sa"], row["url"])
    require(request(url, "/health", token)[0], 200)
    require(request(url, "/internal/v1/assistant/turn", token, {})[0], 400)
    # Provider acceptance requires the approved bundle, never the legacy bundle.
    bundle = json.loads(gcloud("secrets", "versions", "access", "latest", "--secret=omniagent-provider-bundle"))
    signing = bundle.get("mcp_owner_signing_key", "")
    if not isinstance(signing, str) or len(signing.strip()) < 32:
        raise RuntimeError("invalid provider signing key")
    import hmac
    for provider, model in (("gemini", "gemini-2.5-flash"), ("openrouter", "openrouter/free")):
        body = {"ownerId": str(uuid.uuid4()), "threadId": "v2-" + uuid.uuid4().hex,
            "turnId": "v2-" + uuid.uuid4().hex, "runtime": provider, "model": model,
            "messages": [{"role": "user", "content": "Reply with exactly READY."}], "continuation": {}}
        timestamp = str(int(time.time() * 1000))
        raw = json.dumps(body).encode()
        signature = hmac.new(signing.strip().encode(), timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
        provider_call(state)
        status, reply = request(url, "/internal/v1/assistant/turn", token, body,
            {"X-OmniAgent-Timestamp": timestamp, "X-OmniAgent-Signature": "v1=" + signature}, timeout=300)
        require(status, 200)
        events = reply.get("events", [])
        if not any(e["type"] == "turn_completed" for e in events) or not any(e["type"] == "text_delta" and e["payload"].get("text") for e in events):
            raise RuntimeError(provider + " provider completion failed")
    state["gates"]["gateway"] = "PASS"


def recovery(state):
    # Exercise routing recovery on an isolated tag; never shift active traffic.
    for key in state["components"]:
        row = state["services"][key]
        if not row.get("candidate_revision"):
            raise RuntimeError("recovery blocked: " + key + " candidate unavailable")
        initial = service(SERVICES[key])
        baseline = traffic_percent(row["previous_traffic"])
        if traffic_percent(initial["status"]["traffic"]) != baseline:
            raise RuntimeError("candidate changed active traffic")
        tag = "v2-recovery-" + state["build_id"][:8]
        if any(route.get("tag") == tag for route in initial["status"]["traffic"]):
            raise RuntimeError("recovery tag collision; existing tag must not be overwritten")
        try:
            for revision in (row["candidate_revision"], row["previous_revision"], row["candidate_revision"]):
                gcloud("run", "services", "update-traffic", SERVICES[key], f"--region={REGION}",
                    "--update-tags=" + tag + "=" + revision)
                route = recovery_route(service(SERVICES[key]), tag, revision, baseline)
                token = None if key == "chat" else identity(
                    state["services"]["chat"]["runtime_sa"] if key == "gateway" else f"omniagent-codex-chat-client@{PROJECT}.iam.gserviceaccount.com", row["url"])
                require(request(route["url"], "/health", token)[0], 200)
        finally:
            gcloud("run", "services", "update-traffic", SERVICES[key], f"--region={REGION}", "--remove-tags=" + tag)
        after = service(SERVICES[key])
        if any(route.get("tag") == tag for route in after["status"]["traffic"]):
            raise RuntimeError("recovery tag removal not confirmed")
        if traffic_percent(after["status"]["traffic"]) != baseline:
            raise RuntimeError("recovery changed active traffic")
        state.setdefault("recovery_probe", {})[key] = "PASS: candidate -> previous -> candidate tagged route, active traffic preserved"
        save(state)
    state["gates"]["no_traffic_preserved"] = "PASS"
    state["gates"]["recovery"] = "PASS"


if __name__ == "__main__":
    state = json.loads(STATE.read_text(encoding="utf-8"))
    # Every mandatory gate runs even if another component is blocked.
    for name, probe in (("chat", chat), ("shared", shared), ("gateway", gateway), ("recovery", recovery)):
        if name != "recovery" and name not in state["components"] and os.environ.get("VERIFY_ALL_PATHS") != "true":
            state["gates"][name] = "NOT_AFFECTED"
            continue
        try:
            probe(state)
        except Exception as exc:
            state["gates"][name] = "FAIL: " + str(exc)
        save(state)
    # Actual release is a separate fail-closed step; preserve all probe evidence.
