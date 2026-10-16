import { describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "../services/agent-gateway/openrouter_provider.js";

function response(body: unknown, status = 200, headers: Record<string, string> = { "content-type": "application/json" }): Response { return new Response(JSON.stringify(body), { status, headers }); }

const models = { data: [{ id: "free/model:free", name: "Free", context_length: 4096, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools", "streaming"] }, { id: "paid/model", name: "Paid", context_length: 4096, pricing: { prompt: "1", completion: "1" }, supported_parameters: ["tools"] }] };

describe("OpenRouter provider", () => {
  it("lists only free models and filters capabilities", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(models));
    const result = await new OpenRouterProvider("secret", fetcher as typeof fetch).listModels(["tools", "streaming"]);
    expect(result.map((item) => item.id)).toEqual(["free/model:free"]);
    expect(String(fetcher.mock.calls[0][0])).toContain("max_price=0");
    expect(String(fetcher.mock.calls[0][0])).toContain("supported_parameters=tools%2Cstreaming");
  });

  it("runs a bounded function-call loop", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(models)).mockResolvedValueOnce(response({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "quote", arguments: "{\"symbol\":\"2330\"}" } }] } }] })).mockResolvedValueOnce(response({ choices: [{ message: { role: "assistant", content: "100" } }] }));
    const provider = new OpenRouterProvider("secret", fetcher as typeof fetch);
    const result = await provider.complete([{ role: "user", content: "price" }], { model: "free/model:free", tools: [{ type: "function", function: { name: "quote", parameters: { type: "object" } } }], executeTool: async (name, args) => ({ name, args }) });
    expect(result.text).toBe("100");
    expect(result.messages.at(-1)?.role).toBe("assistant");
  });

  it("requires an explicit paid billing gate and maps quota safely", async () => {
    expect(() => new OpenRouterProvider("secret", fetch, "https://example.test", false)).toThrow("billing gate");
    const provider = new OpenRouterProvider("secret", vi.fn().mockResolvedValue(response({ error: { message: "secret" } }, 429)) as typeof fetch);
    await expect(provider.listModels()).rejects.toMatchObject({ kind: "quota", status: 429, message: "quota" });
  });
});

function sse(...parts: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    }
  });
  return new Response(stream,{status:200,headers:{"content-type":"text/event-stream"}});
}

async function collectEvents(source: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of source) events.push(event);
  return events;
}

describe("OpenRouter SSE evidence and bounded replay", () => {
  it("accepts split Unicode and CRLF only with an explicit DONE marker", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(models)).mockResolvedValueOnce(
      sse('data: {"choices":[{"delta":{"content":"你"}}]}\r\n',
          'data: {"choices":[{"delta":{"content":"好"}}]}\r\n',
          'data: {"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\r\n',
          "data: [DONE]\r\n")
    );
    const provider = new OpenRouterProvider("fake-token",fetcher as typeof fetch);
    const rows = await collectEvents(provider.stream([{role:"user",content:"say hello"}],{model:"free/model:free"}));
    expect(rows).toEqual([
      {type:"text_delta",delta:"你"},
      {type:"text_delta",delta:"好"},
      {type:"usage",usage:{promptTokens:2,completionTokens:3,totalTokens:5}},
      {type:"turn_completed",result:{model:"free/model:free",
        messages:[{role:"user",content:"say hello"}],text:"你好",
        usage:{promptTokens:2,completionTokens:3,totalTokens:5}}}
    ]);
  });

  it("never treats a dropped SSE connection as turn_completed", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(models))
      .mockResolvedValueOnce(sse('data: {"choices":[{"delta":{"content":"partial"}}]}\n'));
    const p = new OpenRouterProvider("fixture-key",fetcher as typeof fetch);
    const seen: unknown[] = [];
    await expect((async () => {
      for await(const event of p.stream([{role:"user",content:"prompt"}],{model:"free/model:free"}))
        seen.push(event);
    })()).rejects.toThrow("without DONE");
    expect(seen).toEqual([{type:"text_delta",delta:"partial"}]);
    expect(seen).not.toEqual(expect.arrayContaining([expect.objectContaining({type:"turn_completed"})]));
  });

  it.each([
    ['data: {"error":{"message":"provider-token"}}\n', "rejected stream"],
    ["data: {invalid}\n", "frame is invalid"],
    ['data: {"choices":[{"delta":{"content":5}}]}\n', "delta is invalid"],
    ['data: {"choices":[{"delta":{"content":"hi"}}]}\nunfinished', "incomplete final frame"]
  ])("rejects malformed or provider-error streams without leaking response data (%s)", async (frame, expected) => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(models)).mockResolvedValueOnce(sse(frame));
    const provider = new OpenRouterProvider("fixture-key",fetcher as typeof fetch);
    await expect(collectEvents(provider.stream([{role:"user",content:"prompt"}],{model:"free/model:free"})))
      .rejects.toThrow(expected);
  });

  it("rejects oversized SSE text and invalid free-only model before provider completion", async () => {
    const chunk = "a".repeat(65_537);
    const fetcher = vi.fn().mockResolvedValueOnce(response(models)).mockResolvedValueOnce(
      sse('data: '+JSON.stringify({choices:[{delta:{content:chunk}}]})+'\n','data: [DONE]\n'));
    const provider = new OpenRouterProvider("fixture-key",fetcher as typeof fetch);
    await expect(collectEvents(provider.stream([{role:"user",content:"prompt"}],{model:"free/model:free"})))
      .rejects.toThrow("text exceeds limit");
    const denied = vi.fn().mockResolvedValueOnce(response(models));
    const free = new OpenRouterProvider("fixture-key",denied as typeof fetch);
    await expect(collectEvents(free.stream([{role:"user",content:"prompt"}],{model:"paid/model"})))
      .rejects.toThrow("not approved");
    expect(denied).toHaveBeenCalledTimes(1);
  });
});
