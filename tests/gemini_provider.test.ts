import { describe, expect, it, vi } from "vitest";
import { dispatchAssistant } from "../services/agent-gateway/assistant_dispatch.js";
import { GeminiProvider } from "../services/agent-gateway/gemini_provider.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Gemini REST provider", () => {
  it("dispatches the selected thread model instead of the environment default", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ candidates: [{ content: { parts: [{ text: "Answer" }] } }] }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    try {
      const result = await dispatchAssistant({ ownerId: "owner", threadId: "thread", turnId: "turn", runtime: "gemini",
        model: "gemini-3.1-flash-lite", messages: [{ role: "user", content: "Question" }] });
      expect(fetcher.mock.calls[0][0]).toContain("/models/gemini-3.1-flash-lite:generateContent");
      expect(result).toMatchObject({ continuation: { model: "gemini-3.1-flash-lite" } });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
  it("sends Google Search grounding and preserves citations and usage", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      candidates: [{ content: { parts: [{ text: "Answer" }] }, finishReason: "STOP", groundingMetadata: {
        webSearchQueries: ["omniagent"], groundingChunks: [{ web: { uri: "https://example.test", title: "Example" } }],
      } }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
    }));
    const provider = new GeminiProvider("secret", "gemini-3.5-flash-lite", fetcher as typeof fetch);
    const result = await provider.generate("Question", { grounding: true });
    const request = fetcher.mock.calls[0][1] as RequestInit;
    expect(fetcher.mock.calls[0][0]).toContain(":generateContent");
    expect(request.headers).toMatchObject({ "x-goog-api-key": "secret" });
    expect(JSON.parse(String(request.body))).toMatchObject({ tools: [{ google_search: {} }] });
    expect(result).toMatchObject({ text: "Answer", searchQueries: ["omniagent"], citations: [{ title: "Example", uri: "https://example.test" }], usage: { totalTokens: 5 } });
    expect(result.queriedAt).toMatch(/Z$/);
  });

  it.each([[429, "quota"], [503, "provider_unavailable"]] as const)("maps HTTP %s to %s without leaking provider text", async (status, kind) => {
    const provider = new GeminiProvider("secret", "gemini-3.5-flash-lite", vi.fn().mockResolvedValue(response({ error: { message: "secret detail" } }, status)) as typeof fetch);
    await expect(provider.generate("Question")).rejects.toMatchObject({ kind, status, message: kind });
  });

  it.each(["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash",
    "gemini-2.5-flash","gemini-3.1-pro-preview"])(
    "rejects %s before the provider sends any network request", async model => {
      const fetcher = vi.fn();
      expect(() => new GeminiProvider("secret",model,fetcher as typeof fetch))
        .toThrow("Flash-Lite allowlist");
      vi.stubGlobal("fetch",fetcher);
      vi.stubEnv("GEMINI_API_KEY","fixture-key");
      try {
        await expect(dispatchAssistant({ownerId:"test",threadId:"t",turnId:"turn",
          runtime:"gemini",model,messages:[{role:"user",content:"Hello"}]}))
          .rejects.toThrow("Flash-Lite allowlist");
        expect(fetcher).not.toHaveBeenCalled();
      } finally {vi.unstubAllGlobals();vi.unstubAllEnvs();}
    });

  it("fails closed when paid Gemini is enabled", () => {
    vi.stubEnv("GEMINI_PAID_ENABLED", "true");
    expect(() => new GeminiProvider("secret")).toThrow("paid tier is disabled");
    vi.unstubAllEnvs();
  });
});
