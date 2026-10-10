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
  return entries.some(row => row.ownerId === ownerId.toLowerCase() &&
    row.runtime === runtime && row.model === model && row.credentialMode === "platform");
}
