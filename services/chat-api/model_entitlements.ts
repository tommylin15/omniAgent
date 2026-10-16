/**
 * Per-owner platform-model authorization, separate from Google OAuth.
 * This policy is not a BYOK resolver. Secrets never pass through Chat.
 * Requires a second explicit allowlist and dispatch enablement in main.ts.
 */
export type ModelRuntime = "gemini" | "openrouter" | "codex";
export type ModelEntitlement = Readonly<{
  ownerId: string;
  runtime: ModelRuntime;
  model: string;
  credentialMode: "platform";
}>;

// User-approved Gemini Chat policy: only text Flash-Lite model IDs.
// Provider API eligibility, quota and billing are separate checks.
export const GEMINI_LITE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
] as const;
const geminiLite = new Set<string>(GEMINI_LITE_MODELS);
export function isAllowedGeminiModel(model: string): boolean {
  return geminiLite.has(model);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIMPLE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ROUTER_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127})?$/;

export function parseModelEntitlements(raw: string, approvedOwners: readonly string[]): ModelEntitlement[] {
  let data: unknown;
  try { data = JSON.parse(raw) as unknown; }
  catch { throw new Error("model entitlements configuration is invalid"); }
  if (!Array.isArray(data) || !data.length || data.length > 100)
    throw new Error("model entitlements configuration is missing or oversized");
  const owners = new Set(approvedOwners.map(owner => owner.toLowerCase()));
  const entries: ModelEntitlement[] = [];
  const unique = new Set<string>();
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("model entitlement row is invalid");
    const row = item as Record<string, unknown>;
    if (Object.keys(row).sort().join(",") !== "credentialMode,model,ownerId,runtime")
      throw new Error("model entitlement includes unapproved fields");
    if (typeof row.ownerId !== "string" || !UUID.test(row.ownerId.toLowerCase()) ||
        !owners.has(row.ownerId.toLowerCase()) ||
        !["gemini","openrouter","codex"].includes(String(row.runtime)) ||
        typeof row.model !== "string" ||
        !(row.runtime === "openrouter" ? ROUTER_MODEL : SIMPLE_MODEL).test(row.model) ||
        row.model.includes("..") || row.model.includes("//") ||
        row.credentialMode !== "platform") {
      // BYOK requires separate approved Secret lifecycle before enablement.
      throw new Error("model entitlement is not authorized");
    }
    if (row.runtime === "gemini" && !isAllowedGeminiModel(row.model))
      throw new Error("Gemini Chat platform models must be approved Flash-Lite");
    if (row.runtime === "openrouter" &&
        row.model !== "openrouter/free" && !row.model.endsWith(":free"))
      throw new Error("OpenRouter platform models must use free-only mode");
    const entry = { ownerId: row.ownerId.toLowerCase(),
      runtime: row.runtime as ModelRuntime, model: row.model, credentialMode: "platform" as const };
    const key = JSON.stringify([entry.ownerId,entry.runtime,entry.model]);
    if (unique.has(key)) throw new Error("duplicate model entitlement");
    unique.add(key);
    entries.push(entry);
  }
  return entries;
}

export function allowsModel(entries: readonly ModelEntitlement[],
  ownerId: string, runtime: string, model: string): boolean {
  if (runtime === "gemini" && !isAllowedGeminiModel(model)) return false;
  return entries.some(row => row.ownerId === ownerId.toLowerCase() &&
    row.runtime === runtime && row.model === model && row.credentialMode === "platform");
}
