import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqProvider } from "../services/agent-gateway/groq_provider.js";

const prior=process.env.GROQ_EXECUTION_ENABLED;
afterEach(() => {
  if (prior === undefined) delete process.env.GROQ_EXECUTION_ENABLED;
  else process.env.GROQ_EXECUTION_ENABLED = prior;
});

const messages=[{role:"user" as const,content:"你好"}];
const ok={model:"llama-3.3-70b-versatile", choices:[{
  finish_reason:"stop", message:{role:"assistant",content:"模型回覆"}
}],usage:{prompt_tokens:3,completion_tokens:4,total_tokens:7}};

describe("Groq source-only provider; never performs real calls in CI", () => {
  it("fails closed without explicit model-execution opt-in", async () => {
    delete process.env.GROQ_EXECUTION_ENABLED;
    const fetcher=vi.fn();
    const client=new GroqProvider("test-fixture-key",fetcher as typeof fetch);
    await expect(client.complete(messages,"llama-3.3-70b-versatile"))
      .rejects.toThrow("disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts only bounded text and emits sanitized response fields", async () => {
    process.env.GROQ_EXECUTION_ENABLED="true";
    const fetcher=vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(ok),{status:200}));
    const client=new GroqProvider("test-fixture-key",fetcher as typeof fetch);
    expect(await client.complete(messages,"llama-3.3-70b-versatile")).toEqual({
      text:"模型回覆",model:"llama-3.3-70b-versatile",finishReason:"stop",
      usage:{promptTokens:3,completionTokens:4,totalTokens:7}
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url,opts]=fetcher.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(opts.headers.authorization).toBe("Bearer test-fixture-key");
    const body=JSON.parse(String(opts.body));
    expect(body).toMatchObject({model:"llama-3.3-70b-versatile",stream:false,
      max_completion_tokens:512,messages});
    expect(JSON.stringify(body)).not.toContain("test-fixture-key");
  });

  it("rejects injected IDs, tool messages and unapproved alternate hosts", async () => {
    process.env.GROQ_EXECUTION_ENABLED="true";
    const fetcher=vi.fn();
    const client=new GroqProvider("fake",fetcher as typeof fetch);
    for(const model of ["bad/../model","a//b","","https://bad"]) {
      await expect(client.complete(messages,model)).rejects.toThrow("model");
    }
    await expect(client.complete([{role:"tool",content:"output",tool_call_id:"call-1"}],"test-model"))
      .rejects.toThrow("messages");
    expect(() => new GroqProvider("fake",fetch,"https://example.net/openai/v1"))
      .toThrow("not approved");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps rate limit without leaking provider details and rejects missing output", async () => {
    process.env.GROQ_EXECUTION_ENABLED="true";
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('{"error":"sensitive"}',{status:429}))
      .mockResolvedValueOnce(new Response(JSON.stringify({model:"test-model",
        choices:[{message:{content:null}}]}),{status:200}));
    const client=new GroqProvider("fake",fetcher as typeof fetch);
    await expect(client.complete(messages,"test-model")).rejects.toMatchObject({
      kind:"quota",status:429,message:"quota"
    });
    await expect(client.complete(messages,"test-model")).rejects.toThrow("no accepted text");
  });
});
