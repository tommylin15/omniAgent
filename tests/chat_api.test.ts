import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeChatServer } from "../services/chat-api/server.js";
import { safeRecord, type ChatStore } from "../services/chat-api/storage.js";

const servers: ReturnType<typeof makeChatServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

async function app() {
  const store = {
    ready: vi.fn(async () => undefined),
    owner: vi.fn(async (_issuer: string, subject: string) => "owner-" + subject),
    createThread: vi.fn(async (ownerId: string, input: unknown) => ({ owner_id: ownerId, thread_id: "thread-1", input })),
    threads: vi.fn(async (ownerId: string) => [{ owner_id: ownerId, thread_id: "thread-1" }]),
    thread: vi.fn(async (ownerId: string, threadId: string) => ({ owner_id: ownerId, thread_id: threadId,
      runtime: "gemini", model: "gemini-2.5-flash", assistant_profile: "default" })),
    message: vi.fn(async (ownerId: string, threadId: string, content: string) => ({ owner_id: ownerId,
      turn: { turn_id: "turn-1", status: "QUEUED" }, event: { payload: { content }, thread_id: threadId }, dispatch: { status: "QUEUED" } })),
    events: vi.fn(async (ownerId: string) => [{ owner_id: ownerId, seq: 0, event_type: "item_upsert", payload: { content: "hello" } }]),
    appendEvent: vi.fn(async (ownerId: string) => ({ owner_id: ownerId, event_id: "event-1" })),
    requestApproval: vi.fn(async (value: unknown) => ({ ...value as object, status: "PENDING" })),
    decideApproval: vi.fn(async (ownerId: string) => ({ owner_id: ownerId, status: "APPROVED" })),
    cancelQueuedTurn: vi.fn(async (ownerId: string, threadId: string, turnId: string) =>
      ({ owner_id: ownerId, thread_id: threadId, turn_id: turnId, status: "CANCELLED" })),
  };
  const server = makeChatServer(store as unknown as ChatStore,
    async (token) => {
      if (token !== "alice" && token !== "bob") throw new Error("unauthorized");
      return { issuer: "https://accounts.google.com", subject: token };
    }, async (token) => { if (token !== "service") throw new Error("unauthorized"); });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0,"127.0.0.1",resolve));
  return { base: "http://127.0.0.1:" + (server.address() as AddressInfo).port, store };
}

describe("omniAgent Chat API ownership boundary", () => {
  it("separates liveness from database readiness", async () => {
    const { base, store } = await app();
    expect((await fetch(base + "/health")).status).toBe(200);
    const ready = await fetch(base + "/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status:"ready" });
    expect(store.ready).toHaveBeenCalledTimes(1);
    store.ready.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await fetch(base + "/ready")).status).toBe(503);
  });

  it("serves the same-origin Web app without exposing API routes", async () => {
    const root = mkdtempSync(join(tmpdir(),"omni-web-"));
    writeFileSync(join(root,"index.html"),"<title>omniAgent</title>");
    process.env.OMNIAGENT_WEB_ROOT = root;
    try {
      const { base } = await app();
      const page = await fetch(base + "/");
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(await page.text()).toContain("omniAgent");
      expect((await fetch(base + "/v1/threads")).status).toBe(401);
    } finally {
      delete process.env.OMNIAGENT_WEB_ROOT;
      rmSync(root,{ recursive:true, force:true });
    }
  });

  it("derives owner from verified identity and persists queued messages and replay", async () => {
    const { base, store } = await app();
    const headers = { Authorization: "Bearer alice", "Idempotency-Key": "key-1", "Content-Type": "application/json" };
    const created = await fetch(base + "/v1/threads", { method: "POST", headers,
      body: JSON.stringify({ runtime: "gemini", model: "gemini-2.5-flash", assistantProfile: "default", ownerId: "owner-bob" }) });
    expect(created.status).toBe(201);
    expect((await created.json()).owner_id).toBe("owner-alice");
    const message = await fetch(base + "/v1/threads/thread-1/messages", { method: "POST", headers,
      body: JSON.stringify({ content: "hello" }) });
    expect(message.status).toBe(202);
    expect((await message.json()).dispatch.status).toBe("QUEUED");
    const replay = await fetch(base + "/v1/threads/thread-1/events?cursor=-1", { headers });
    expect(replay.status).toBe(200);
    expect(await replay.text()).toContain("event: item_upsert");
    expect(store.message).toHaveBeenCalledWith("owner-alice","thread-1","hello","key-1");
    expect((await (await fetch(base + "/v1/threads", { headers: { Authorization: "Bearer bob" } })).json()).items[0].owner_id).toBe("owner-bob");
  });

  it("requires separate user and service identities for decisions and runtime writes", async () => {
    const { base, store } = await app();
    expect((await fetch(base + "/v1/threads")).status).toBe(401);
    const approvalPath = "/v1/threads/thread-1/turns/turn-1/approvals/request-1";
    const digest = "sha256:" + "a".repeat(64);
    const rejected = await fetch(base + approvalPath,{ method:"POST", headers: { Authorization:"Bearer service", "Content-Type":"application/json" },
      body:JSON.stringify({ approved:true, paramsDigest:digest }) });
    expect(rejected.status).toBe(401);
    const decided = await fetch(base + approvalPath,{ method:"POST", headers: { Authorization:"Bearer alice", "Content-Type":"application/json" },
      body:JSON.stringify({ approved:true, paramsDigest:digest }) });
    expect(decided.status).toBe(200);
    expect(store.decideApproval).toHaveBeenCalledWith("owner-alice","thread-1","turn-1","request-1",digest,true);
    const internal = await fetch(base + "/internal/v1/chat/events", { method:"POST",
      headers:{ Authorization:"Bearer alice", "Content-Type":"application/json" },
      body:JSON.stringify({ ownerId:"owner-alice",threadId:"thread-1",turnId:"turn-1",eventId:"event-1",type:"text_delta",payload:{} }) });
    expect(internal.status).toBe(401);
    expect(store.appendEvent).not.toHaveBeenCalled();
    const serviceWrite = await fetch(base + "/internal/v1/chat/events", { method:"POST",
      headers:{ Authorization:"Bearer service", "Content-Type":"application/json" },
      body:JSON.stringify({ ownerId:"owner-alice",threadId:"thread-1",turnId:"turn-1",eventId:"event-1",type:"text_delta",payload:{} }) });
    expect(serviceWrite.status).toBe(201);
    expect(store.appendEvent).toHaveBeenCalledWith("owner-alice","thread-1","turn-1","event-1","text_delta",{});
  });

  it("forks within the verified owner and only cancels queued turns", async () => {
    const { base, store } = await app();
    const headers = { Authorization: "Bearer alice", "Idempotency-Key": "fork-1", "Content-Type": "application/json" };
    const fork = await fetch(base + "/v1/threads/thread-1/fork", { method:"POST", headers,
      body:JSON.stringify({ threadId:"thread-2" }) });
    expect(fork.status).toBe(201);
    expect(store.createThread).toHaveBeenCalledWith("owner-alice",{
      runtime:"gemini",model:"gemini-2.5-flash",assistantProfile:"default",
      parentThreadId:"thread-1",threadId:"thread-2" },"fork-1");
    const cancel = await fetch(base + "/v1/threads/thread-1/turns/turn-1/cancel", { method:"POST", headers });
    expect(cancel.status).toBe(200);
    expect(store.cancelQueuedTurn).toHaveBeenCalledWith("owner-alice","thread-1","turn-1");
  });

  it("rejects nested credentials and keeps the new schema isolated from legacy history", () => {
    expect(() => safeRecord({ payload: [{ refresh_token: "secret" }] })).toThrow("credential");
    const sql = readFileSync("infra/postgres/migrations/001_chat_ownership.sql","utf8");
    expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS omni_chat");
    expect(sql).toContain("UNIQUE (issuer, subject)");
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
    expect(sql).not.toContain("private.assistant_threads");
  });
});
