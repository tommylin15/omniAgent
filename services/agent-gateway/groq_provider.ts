import type { ChatMessage } from "./openrouter_provider.js";

export type GroqUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type GroqResult = {
  text: string;
  model: string;
  usage?: GroqUsage;
  finishReason?: string;
};

export class GroqProviderError extends Error {
  constructor(public readonly kind: "quota" | "provider_unavailable" | "provider_error",
              public readonly status: number) {
    super(kind);
  }
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/**
 * Text-only bounded Groq provider source. NOT wired to Chat runtime yet.
 * A valid key alone never authorizes billable inference.
 */
export class GroqProvider {
  constructor(private readonly apiKey: string,
              private readonly fetcher: typeof fetch = fetch,
              private readonly baseUrl = "https://api.groq.com/openai/v1") {
    if (!apiKey.trim()) throw new Error("GROQ_API_KEY is required");
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.search || parsed.hash || parsed.origin !== "https://api.groq.com" ||
        parsed.pathname !== "/openai/v1") {
      throw new Error("Groq API base URL is not approved");
    }
  }

  static fromEnvironment(fetcher: typeof fetch = fetch): GroqProvider {
    return new GroqProvider(process.env.GROQ_API_KEY ?? "", fetcher);
  }

  async complete(messages: readonly ChatMessage[], model: string): Promise<GroqResult> {
    if (process.env.GROQ_EXECUTION_ENABLED !== "true")
      throw new Error("Groq execution is disabled");
    if (!MODEL_ID.test(model) || model.includes("..") || model.includes("//"))
      throw new Error("Groq model is invalid");
    if (!messages.length || messages.length > 100 ||
        messages.some(m => !["system", "user", "assistant"].includes(m.role) ||
          typeof m.content !== "string" || !m.content.trim() ||
          m.content.length > 12_000 || m.tool_calls?.length || m.tool_call_id)) {
      throw new Error("Groq messages are invalid");
    }
    const response = await this.fetcher(this.baseUrl + "/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { authorization: "Bearer " + this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({role: m.role, content: m.content})),
        stream: false,
        max_completion_tokens: 512
      })
    });
    if (!response.ok)
      throw new GroqProviderError(response.status === 429 ? "quota" :
        response.status >= 500 ? "provider_unavailable" : "provider_error", response.status);

    const body = await response.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Groq response is invalid");
    const data = body as Record<string,unknown>;
    if (!Array.isArray(data.choices) || data.choices.length !== 1)
      throw new Error("Groq response is invalid");
    const choice = data.choices[0] as Record<string,unknown> | null;
    const message = choice?.message;
    if (!message || typeof message !== "object" || Array.isArray(message))
      throw new Error("Groq response is invalid");
    const content = (message as Record<string,unknown>).content;
    if (typeof content !== "string" || !content.trim() || content.length > 100_000)
      throw new Error("Groq response has no accepted text");
    if (typeof data.model !== "string" || !MODEL_ID.test(data.model))
      throw new Error("Groq response model is invalid");
    const usage = data.usage && typeof data.usage === "object" && !Array.isArray(data.usage)
      ? data.usage as Record<string,unknown> : {};
    const counts = [usage.prompt_tokens,usage.completion_tokens,usage.total_tokens];
    const acceptedUsage = counts.every(x => typeof x === "number" && Number.isSafeInteger(x) && x >= 0)
      ? { promptTokens: counts[0] as number, completionTokens: counts[1] as number,
          totalTokens: counts[2] as number } : undefined;
    return { text:content, model:data.model,
      ...(typeof choice?.finish_reason === "string" ? {finishReason: choice.finish_reason} : {}),
      ...(acceptedUsage ? {usage:acceptedUsage} : {}) };
  }
}
