/** Gateway-local, build-isolated Gemini Chat model policy. Keep in sync with
 * services/chat-api/model_entitlements.ts using Gemini policy contract tests.
 * This is not a provider availability, quota or billing guarantee.
 */
export const GEMINI_LITE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
] as const;

const allowedModels = new Set<string>(GEMINI_LITE_MODELS);
export function isAllowedGeminiModel(model: string): boolean {
  return allowedModels.has(model);
}
