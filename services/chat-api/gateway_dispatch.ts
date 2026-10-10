import { createHmac } from "node:crypto";
import { safeRecord, type ChatStore, type DispatchClaim } from "./storage.js";
import { allowsModel, type ModelEntitlement } from "./model_entitlements.js";

export type DispatchOutcome = { status: "idle" | "completed" | "cancelled" | "error"; turnId?: string; reason?: string };
type TurnEvent = { type: string; payload: unknown };
type Invoke = (claim: DispatchClaim) => Promise<unknown>;
type Store = Pick<ChatStore, "claimNextQueuedTurn" | "appendGatewayEvents"> &
  Partial<Pick<ChatStore, "runningReconciliationCandidates">>;

const types = new Set(["text_delta", "item_upsert", "tool_request", "tool_result",
  "approval_request", "approval_resolved", "citation", "usage",
  "turn_completed", "turn_cancelled", "turn_error"]);
const terminal = new Set(["turn_completed", "turn_cancelled", "turn_error"]);

export class ChatDispatcher {
  constructor(private readonly store: Store, private readonly invoke: Invoke,
              private readonly approvedOwners: readonly string[],
              private readonly entitlements?: readonly ModelEntitlement[]) {}

  async inspectRunningCandidates(): Promise<{ status: string; ageBasis: string; items: Record<string, unknown>[] }> {
    if (!this.store.runningReconciliationCandidates) throw new Error("reconciliation store is unavailable");
    const items = await this.store.runningReconciliationCandidates(this.approvedOwners);
    return { status:"read_only", ageBasis:"queued_created_at_not_claimed_at", items };
  }

  /** Client-visible metadata is derived only from the explicit Owner entitlements. */
  availableModels(ownerId: string): { runtime: string; model: string }[] {
    if (!this.entitlements || !this.approvedOwners.some(owner =>
        owner.toLowerCase() === ownerId.toLowerCase())) return [];
    return this.entitlements.filter(entry => entry.ownerId === ownerId.toLowerCase() &&
      entry.credentialMode === "platform").map(({runtime,model}) => ({runtime,model}))
      .sort((a,b) => a.runtime.localeCompare(b.runtime) || a.model.localeCompare(b.model));
  }

  canDispatch(ownerId: string, runtime?: string, model?: string): boolean {
    if (!this.approvedOwners.some(owner => owner.toLowerCase() === ownerId.toLowerCase())) return false;
    if (!this.entitlements) return true; // Non-production fixture compatibility only.
    return runtime !== undefined && model !== undefined &&
      allowsModel(this.entitlements,ownerId,runtime,model);
  }

  async runOnce(target?: { ownerId: string; threadId: string; turnId: string }): Promise<DispatchOutcome> {
    if (!this.approvedOwners.length) throw new Error("dispatch approval not configured");
    if (target && !this.approvedOwners.some(owner => owner.toLowerCase() === target.ownerId.toLowerCase()))
      throw new Error("dispatch owner not approved");
    const claim = this.entitlements
      ? await this.store.claimNextQueuedTurn(this.approvedOwners,target,this.entitlements)
      : await this.store.claimNextQueuedTurn(this.approvedOwners,target);
    if (!claim) return { status: "idle" };
    if (this.entitlements && !this.canDispatch(claim.ownerId,claim.runtime,claim.model))
      throw new Error("model entitlement claim needs reconciliation");
    let events: TurnEvent[];
    try {
      events = validateEvents(await this.invoke(claim), claim);
    } catch {
      return this.fail(claim);
    }
    try {
      await this.store.appendGatewayEvents(claim.ownerId, claim.threadId, claim.turnId,
        events.map((event,index) => ({
          eventId:`gateway-${claim.turnId}-${index}`, type:event.type, payload:event.payload
        })));
    } catch {
      // No partial event stream becomes visible. Never repeat a provider request
      // after an unknown DB commit outcome; reconcile the claimed RUNNING turn.
      throw new Error("dispatch_persistence_needs_reconciliation");
    }
    const last = events.at(-1)!.type;
    return { status: last === "turn_completed" ? "completed" :
      last === "turn_cancelled" ? "cancelled" : "error", turnId: claim.turnId };
  }

  private async fail(claim: DispatchClaim): Promise<DispatchOutcome> {
    try {
      await this.store.appendGatewayEvents(claim.ownerId, claim.threadId, claim.turnId, [
        { eventId:`gateway-${claim.turnId}-failed`, type:"turn_error",
          payload:{ code:"gateway_outcome_uncertain" } }
      ]);
    } catch {
      throw new Error("dispatch_failure_persistence_needs_reconciliation");
    }
    return { status: "error", turnId: claim.turnId, reason: "gateway_outcome_uncertain" };
  }
}

function validateEvents(value: unknown, claim: DispatchClaim): TurnEvent[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid response");
  const rows = (value as Record<string, unknown>).events;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200) throw new Error("invalid event count");
  const events: TurnEvent[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("invalid event");
    const item = row as Record<string, unknown>;
    if (typeof item.type !== "string" || !types.has(item.type)) throw new Error("invalid event type");
    // The Gateway may echo an owner binding; never persist another owner's
    // response under the claimed database owner, including Codex native turns.
    if (item.ownerId !== undefined && item.ownerId !== claim.ownerId)
      throw new Error("foreign owner binding");
    // Codex native thread/turn IDs do not identify Chat database rows.
    if (claim.runtime !== "codex" &&
        ((item.threadId !== undefined && item.threadId !== claim.threadId) ||
         (item.turnId !== undefined && item.turnId !== claim.turnId))) throw new Error("foreign binding");
    const payload = safeRecord(item.payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        Buffer.byteLength(JSON.stringify(payload)) > 65_536) throw new Error("invalid payload");
    const clean = payload as Record<string, unknown>;
    events.push({ type: item.type, payload: item.type === "text_delta" &&
      typeof clean.delta === "string" && typeof clean.text !== "string"
      ? { ...clean, text: clean.delta } : clean });
  }
  if (events.filter(e => terminal.has(e.type)).length !== 1 ||
      !terminal.has(events.at(-1)!.type)) throw new Error("missing terminal");
  return events;
}

export function makeSignedGatewayInvoker(options: {
  url: string; audience: string; signingKey: string;
  idToken: () => Promise<string>; fetcher?: typeof fetch;
}): Invoke {
  const target = new URL(options.url);
  const audience = new URL(options.audience);
  if (target.protocol !== "https:" || audience.protocol !== "https:" ||
      target.username || target.password || target.search || target.hash ||
      audience.username || audience.password || audience.search || audience.hash ||
      target.pathname !== "/" || audience.pathname !== "/" ||
      options.signingKey.length < 32) throw new Error("unsafe Gateway configuration");
  const fetcher = options.fetcher ?? fetch;
  return async claim => {
    const token = await options.idToken();
    if (!token) throw new Error("Gateway identity unavailable");
    const timestamp = String(Date.now());
    const body = JSON.stringify({ ownerId: claim.ownerId, threadId: claim.threadId,
      turnId: claim.turnId, runtime: claim.runtime, model: claim.model,
      messages: [{ role: "user", content: claim.content }] });
    const signature = createHmac("sha256", options.signingKey)
      .update(timestamp).update(".").update(body).digest("hex");
    const response = await fetcher(new URL("/internal/v1/assistant/turn", target), {
      method: "POST", signal: AbortSignal.timeout(100_000),
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json",
        "X-OmniAgent-Timestamp": timestamp, "X-OmniAgent-Signature": "v1=" + signature },
      body
    });
    // Never log provider HTTP error bodies.
    if (!response.ok) throw new Error("Gateway request failed");
    return response.json() as Promise<unknown>;
  };
}
