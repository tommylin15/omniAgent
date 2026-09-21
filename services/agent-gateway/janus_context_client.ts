import { googleIdentityToken } from "./mcp_host.js";

type JsonObject = Record<string, unknown>;
export type JanusSelector = {
  source_id: string;
  resource: string;
  symbol?: string;
  start_date?: string;
  end_date?: string;
  year?: number;
  limit?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REF = /^[A-Za-z0-9_-]{32,128}$/;
const STORAGE_KEY = /^(?:user_id|owner_id|artifact_ref|artifact_reference|object_path|gcs_uri|storage_uri|raw_payload|credential|password|secret|token|table|table_name)$|_(?:uri|path|credential|password|secret|token)$/i;

function requireContract(condition: unknown): asserts condition {
  if (!condition) throw new Error("Janus context response violates the bounded contract");
}

function object(value: unknown): JsonObject {
  requireContract(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as JsonObject;
}

function safeRecords(value: unknown): void {
  requireContract(Array.isArray(value) && value.length <= 20 && Buffer.byteLength(JSON.stringify(value)) <= 32_768);
  const walk = (item: unknown): void => {
    if (Array.isArray(item)) return item.forEach(walk);
    if (item && typeof item === "object") for (const [key, nested] of Object.entries(item)) {
      requireContract(!STORAGE_KEY.test(key));
      walk(nested);
    }
  };
  walk(value);
}

function provenance(value: unknown, sourceId: string): void {
  requireContract(Array.isArray(value) && value.length >= 1 && value.length <= 20);
  for (const item of value) requireContract(object(item).context_source_id === sourceId);
}

async function boundedJson(response: Response, maxBytes: number): Promise<JsonObject> {
  if (!response.ok) throw new Error("Janus context request failed (" + response.status + ")");
  const reader = response.body?.getReader();
  requireContract(reader);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Janus context response exceeds its byte limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

/** Only public Janus wire endpoints; no Janus source or storage access. */
export class JanusContextClient {
  private readonly origin: string;

  constructor(baseUrl: string, private readonly audience: string, private readonly fetcher: typeof fetch = fetch,
              private readonly identityToken: () => Promise<string> = () => googleIdentityToken(audience, fetcher)) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !audience.trim()) {
      throw new Error("Janus connector requires an HTTPS origin and service audience");
    }
    this.origin = url.origin;
  }

  private async request(path: string, token: string, maxBytes: number, body?: JsonObject): Promise<JsonObject> {
    if (!token || /[\r\n]/.test(token)) throw new Error("Janus bearer credential is unavailable");
    const response = await this.fetcher(this.origin + path, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return boundedJson(response, maxBytes);
  }

  async sources(userToken: string): Promise<JsonObject[]> {
    const result = await this.request("/api/v1/me/ai-sources", userToken, 65_536);
    requireContract(Array.isArray(result.items) && result.items.length <= 16);
    for (const raw of result.items) {
      const source = object(raw), quota = object(source.quota);
      requireContract(typeof source.source_id === "string" && /^(janus-core|janus-private-core|janus-private-mart)$/.test(source.source_id));
      requireContract(source.owner_scope === (source.source_id === "janus-core" ? "public" : "owner"));
      requireContract(typeof source.as_of === "string" || source.as_of === null);
      requireContract(Number.isInteger(quota.max_records) && (quota.max_records as number) <= 20 &&
        Number.isInteger(quota.max_range_days) && (quota.max_range_days as number) <= 366 &&
        Number.isInteger(quota.max_output_bytes) && (quota.max_output_bytes as number) <= 32_768);
    }
    return result.items as JsonObject[];
  }

  async preview(userToken: string, threadId: string, selector: JanusSelector): Promise<JsonObject> {
    if (!ID.test(threadId) || !/^[a-z0-9-]{1,40}$/.test(selector.source_id) || !/^[a-z0-9-]{1,40}$/.test(selector.resource)) {
      throw new Error("Janus preview selector is invalid");
    }
    const result = await this.request("/api/v1/me/chats/" + encodeURIComponent(threadId) + "/context-preview",
      userToken, 65_536, { selector });
    requireContract(result.source_id === selector.source_id && result.resource === selector.resource &&
      typeof result.context_ref === "string" && REF.test(result.context_ref) &&
      typeof result.expires_at === "string" && Number.isFinite(Date.parse(result.expires_at)) &&
      (typeof result.as_of === "string" || result.as_of === null));
    safeRecords(result.preview);
    provenance(result.provenance, selector.source_id);
    return result;
  }

  async resolve(ownerId: string, threadId: string, turnId: string, refs: string[]): Promise<JsonObject> {
    if (!UUID.test(ownerId) || !ID.test(threadId) || !ID.test(turnId) ||
        refs.length < 1 || refs.length > 10 || new Set(refs).size !== refs.length || refs.some((ref) => !REF.test(ref))) {
      throw new Error("Janus context resolve request is invalid");
    }
    const token = await this.identityToken();
    const result = await this.request("/internal/v1/assistant/context:resolve", token, 400_000,
      { owner_id: ownerId, thread_id: threadId, turn_id: turnId, context_refs: refs });
    requireContract(result.owner_id === ownerId && result.thread_id === threadId && result.turn_id === turnId &&
      Array.isArray(result.snapshots) && result.snapshots.length === refs.length);
    for (const raw of result.snapshots) {
      const snapshot = object(raw);
      requireContract(typeof snapshot.source_id === "string" && typeof snapshot.resource === "string" &&
        (typeof snapshot.as_of === "string" || snapshot.as_of === null));
      safeRecords(snapshot.records);
      provenance(snapshot.provenance, snapshot.source_id);
    }
    return result;
  }
}
