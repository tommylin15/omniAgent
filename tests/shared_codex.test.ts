import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexExecutionStageError, classifyCodexRefreshFailure, makeSharedCodexServer, parseCallers, parseRequest } from "../services/shared-codex/server.js";

const ownerId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const caller = "shared-worker@example.iam.gserviceaccount.com";
const valid = { project: "consumer-a", ownerId, requestId, prompt: "Summarize this bounded input." };

describe("shared Codex authenticated execution contract", () => {
  it("rejects forged or malformed project config and invalid requests", () => {
    expect(() => parseCallers("{}")).toThrow("missing_callers");
    expect(() => parseCallers(JSON.stringify({ "consumer-a": "not-email" }))).toThrow("invalid_callers");
    expect(parseCallers(JSON.stringify({ "consumer-a": caller })).get("consumer-a")).toBe(caller);
    expect(parseRequest(valid)).toEqual(valid);
    for (const patch of [
      { project: "other project" }, { ownerId: "wrong" }, { requestId: "wrong" },
      { prompt: "" }, { prompt: "x".repeat(17_000) }, { model: "model with spaces" },
      { credential: "forbidden" },
    ]) expect(() => parseRequest({ ...valid, ...patch })).toThrow();
  });

  it("classifies refresh failures without returning native exception or token text", () => {
    expect(classifyCodexRefreshFailure(new Error("refresh_token_invalidated sensitive-value"))).toBe("reauth_required");
    expect(classifyCodexRefreshFailure(new Error("401 Unauthorized sensitive-value"))).toBe("refresh_rejected");
    expect(classifyCodexRefreshFailure(new Error("request timed out sensitive-value"))).toBe("refresh_timeout");
    expect(classifyCodexRefreshFailure(new Error("ECONNRESET sensitive-value"))).toBe("refresh_network");
    expect(classifyCodexRefreshFailure(new Error("Codex managed auth is unavailable"))).toBe("account_unavailable");
    expect(classifyCodexRefreshFailure(new Error("sensitive-value"))).toBe("unknown");
  });

  it("validates signed caller identity before parsing body or executing", async () => {
    const execute = vi.fn().mockResolvedValue({ text: "OK", threadId: "native-thread", turnId: "native-turn" });
    const verify = vi.fn().mockResolvedValue(caller);
    const server = makeSharedCodexServer({
      callers: new Map([["consumer-a", caller], ["consumer-b", "other@example.iam.gserviceaccount.com"]]),
      audience: "https://shared-codex.example.run.app", execute, verify,
    });
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("address missing");
    const endpoint = "http://127.0.0.1:" + address.port + "/v1/codex/execute";
    try {
      const withoutToken = await fetch(endpoint, { method: "POST", body: JSON.stringify(valid) });
      expect(withoutToken.status).toBe(401);
      expect(verify).not.toHaveBeenCalled();

      verify.mockRejectedValueOnce(new Error("invalid"));
      const fakeToken = await fetch(endpoint, { method: "POST", headers: { authorization: "Bearer fake" }, body: JSON.stringify(valid) });
      expect(fakeToken.status).toBe(401);

      const wrongProject = await fetch(endpoint, { method: "POST", headers: { authorization: "Bearer signed" },
        body: JSON.stringify({ ...valid, project: "consumer-b" }) });
      expect(wrongProject.status).toBe(403);
      expect(execute).not.toHaveBeenCalled();

      const passed = await fetch(endpoint, { method: "POST", headers: { authorization: "Bearer signed" }, body: JSON.stringify(valid) });
      expect(passed.status).toBe(200);
      expect(await passed.json()).toEqual({
        status: "completed", project: valid.project, ownerId, requestId,
        result: { text: "OK" }, providerIds: { threadId: "native-thread", turnId: "native-turn" },
      });
      expect(execute).toHaveBeenCalledOnce();
      expect(verify).toHaveBeenCalledWith("signed", "https://shared-codex.example.run.app");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("fails closed on execution errors without leaking internal errors", async () => {
    const server = makeSharedCodexServer({
      callers: new Map([["consumer-a", caller]]), audience: "https://example.run.app",
      verify: async () => caller, execute: async () => { throw new Error("sensitive-credential"); },
    });
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("address missing");
    try {
      const response = await fetch("http://127.0.0.1:" + address.port + "/v1/codex/execute", {
        method: "POST", headers: { authorization: "Bearer token" }, body: JSON.stringify(valid),
      });
      expect(response.status).toBe(502);
      const body = await response.text();
      expect(body).toContain("codex_execution_failed");
      expect(body).toContain('"failureStage":"unknown"');
      expect(body).not.toContain("sensitive-credential");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("returns only a bounded refresh reason to an authorized caller", async () => {
    const server = makeSharedCodexServer({
      callers: new Map([["consumer-a", caller]]), audience: "https://example.run.app",
      verify: async () => caller,
      execute: async () => { throw new CodexExecutionStageError("account_refresh", "reauth_required"); },
    });
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("address missing");
    try {
      const response = await fetch("http://127.0.0.1:" + address.port + "/v1/codex/execute", {
        method: "POST", headers: { authorization: "Bearer signed" }, body: JSON.stringify(valid),
      });
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        status: "failed", requestId, error: "codex_execution_failed",
        failureStage: "account_refresh", failureReason: "reauth_required",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns only allowlisted execution stage for signed authorized caller", async () => {
    const server = makeSharedCodexServer({
      callers: new Map([["consumer-a", caller]]), audience: "https://example.run.app",
      verify: async () => caller,
      execute: async () => { throw new CodexExecutionStageError("account_read"); },
    });
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("address missing");
    try {
      const endpoint = "http://127.0.0.1:" + address.port + "/v1/codex/execute";
      const forged = await fetch(endpoint, { method: "POST",
        headers: { authorization: "Bearer token" },
        body: JSON.stringify({ ...valid, project: "other" }) });
      expect(forged.status).toBe(403);
      expect((await forged.text())).not.toContain("failureStage");

      const response = await fetch(endpoint, { method: "POST",
        headers: { authorization: "Bearer token" }, body: JSON.stringify(valid) });
      expect(response.status).toBe(502);
      const result = await response.json() as Record<string, unknown>;
      expect(result).toEqual({
        status: "failed", requestId, error: "codex_execution_failed",
        failureStage: "account_read",
      });
      expect(JSON.stringify(result)).not.toContain("sensitive");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

});
