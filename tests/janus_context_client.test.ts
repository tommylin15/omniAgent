import { describe, expect, it, vi } from "vitest";
import { JanusContextClient } from "../services/agent-gateway/janus_context_client.js";

const owner = "00000000-0000-0000-0000-000000000001";
const ref = "a".repeat(43);
const records = [{ symbol: "2330", trade_date: "2026-09-17", source_id: "twse", provenance_id: "prov-1" }];
const provenance = [{ context_source_id: "janus-core", source_id: "twse", provenance_id: "prov-1" }];
const source = { source_id: "janus-core", kind: "core", capabilities: ["preview", "date_range"], as_of: null,
  freshness: "published daily data", owner_scope: "public", status: "available",
  quota: { max_records: 20, max_range_days: 366, max_output_bytes: 32_768 }, disclosure: "Published data" };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("Janus authenticated bounded HTTP connector", () => {
  it("uses per-request user auth for preview and service identity for resolve", async () => {
    const calls: Array<{ path: string; auth: string; body?: unknown }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "metadata.google.internal") {
        expect(url.searchParams.get("audience")).toBe("https://janus.example/internal");
        expect(options?.headers).toEqual({ "Metadata-Flavor": "Google" });
        return new Response("service-token");
      }
      const auth = new Headers(options?.headers).get("Authorization") ?? "";
      calls.push({ path: url.pathname, auth, body: options?.body && JSON.parse(String(options.body)) });
      if (url.pathname.endsWith("/ai-sources")) return json({ items: [source] });
      if (url.pathname.endsWith("/context-preview")) return json({ source_id: "janus-core", resource: "ohlcv",
        preview: records, as_of: "2026-09-17", provenance, context_ref: ref, expires_at: "2099-01-01T00:00:00Z" });
      return json({ owner_id: owner, thread_id: "thread-1", turn_id: "turn-1",
        snapshots: [{ source_id: "janus-core", resource: "ohlcv", as_of: "2026-09-17", records, provenance }] });
    });
    const client = new JanusContextClient("https://janus.example/", "https://janus.example/internal", fetcher as typeof fetch);
    expect((await client.sources("user-token"))[0].owner_scope).toBe("public");
    expect((await client.preview("user-token", "thread-1", { source_id: "janus-core", resource: "ohlcv", symbol: "2330", limit: 1 })).context_ref).toBe(ref);
    expect((await client.resolve(owner, "thread-1", "turn-1", [ref])).snapshots).toHaveLength(1);
    expect(calls.map((call) => call.auth)).toEqual(["Bearer user-token", "Bearer user-token", "Bearer service-token"]);
    expect(calls[2].body).toEqual({ owner_id: owner, thread_id: "thread-1", turn_id: "turn-1", context_refs: [ref] });
    expect(calls.every((call) => call.path.startsWith("/api/v1/me/") || call.path === "/internal/v1/assistant/context:resolve")).toBe(true);
  });

  it("fails closed on auth rejection, owner mismatch, storage locators and unbounded output", async () => {
    expect(() => new JanusContextClient("http://janus.example/", "audience")).toThrow("HTTPS");
    const denied = new JanusContextClient("https://janus.example/", "audience",
      vi.fn(async () => json({ detail: "private" }, 401)) as typeof fetch, async () => "service-token");
    await expect(denied.resolve(owner, "thread-1", "turn-1", [ref])).rejects.toThrow("(401)");
    const response = { owner_id: owner, thread_id: "thread-1", turn_id: "turn-1",
      snapshots: [{ source_id: "janus-core", resource: "ohlcv", as_of: "2026-09-17", records, provenance }] };
    for (const invalid of [
      { ...response, owner_id: "00000000-0000-0000-0000-000000000002" },
      { ...response, snapshots: [{ ...response.snapshots[0], records: [{ gcs_uri: "gs://private" }] }] },
      { ...response, snapshots: [{ ...response.snapshots[0], records: Array(21).fill(records[0]) }] },
      { ...response, snapshots: [{ ...response.snapshots[0], provenance: [{ context_source_id: "other" }] }] },
    ]) {
      const client = new JanusContextClient("https://janus.example/", "audience",
        vi.fn(async () => json(invalid)) as typeof fetch, async () => "service-token");
      await expect(client.resolve(owner, "thread-1", "turn-1", [ref])).rejects.toThrow("bounded contract");
    }
    const huge = new JanusContextClient("https://janus.example/", "audience",
      vi.fn(async () => new Response("x".repeat(400_001))) as typeof fetch, async () => "service-token");
    await expect(huge.resolve(owner, "thread-1", "turn-1", [ref])).rejects.toThrow("byte limit");
    await expect(denied.resolve(owner, "thread-1", "turn-1", [ref, ref])).rejects.toThrow("invalid");
  });
});
