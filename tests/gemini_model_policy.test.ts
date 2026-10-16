import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GEMINI_LITE_MODELS as chatLite, isAllowedGeminiModel as chatAllowed } from
  "../services/chat-api/model_entitlements.js";
import { GEMINI_LITE_MODELS as gatewayLite, isAllowedGeminiModel as gatewayAllowed } from
  "../services/agent-gateway/gemini_model_policy.js";

const expected = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite"];

describe("Gemini Lite-only policy across Chat, Gateway and Flutter", () => {
  it("keeps all build-isolated policies synchronized with exactly three Lite IDs", () => {
    expect([...chatLite]).toEqual(expected);
    expect([...gatewayLite]).toEqual(expected);
    const catalog = readFileSync("apps/agent_app/lib/model_catalog.dart", "utf8");
    const block = catalog.match(/'gemini': \[([\s\S]*?)\n\s*\],/);
    expect(block).not.toBeNull();
    const models = [...block![1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    expect(models).toEqual(expected);
  });

  it.each(["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash",
    "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash",
    "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-3.8-flash-lite-tts"])(
    "denies the non-text-Lite model %s in both services", (model) => {
      expect(chatAllowed(model)).toBe(false);
      expect(gatewayAllowed(model)).toBe(false);
    });

  it.each(expected)("permits Lite model %s in both services", (model) => {
    expect(chatAllowed(model)).toBe(true);
    expect(gatewayAllowed(model)).toBe(true);
  });
});
