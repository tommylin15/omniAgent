import { describe, expect, it, vi } from "vitest";
import { allowsModel, parseModelEntitlements } from "../services/chat-api/model_entitlements.js";
import { ChatDispatcher } from "../services/chat-api/gateway_dispatch.js";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const policy = [
  { ownerId:owner, runtime:"gemini", model:"gemini-3.5-flash-lite", credentialMode:"platform" },
  { ownerId:owner, runtime:"openrouter", model:"openrouter/free", credentialMode:"platform" }
];

describe("per-owner / runtime / exact model platform entitlement", () => {
  it("requires a positive allowlist for each model, not Google OAuth alone", () => {
    const parsed = parseModelEntitlements(JSON.stringify(policy),[owner]);
    expect(parsed).toHaveLength(2);
    expect(allowsModel(parsed,owner,"gemini","gemini-3.5-flash-lite")).toBe(true);
    expect(allowsModel(parsed,other,"gemini","gemini-3.5-flash-lite")).toBe(false);
    expect(allowsModel(parsed,owner,"codex","gpt-6-luna")).toBe(false);
    expect(allowsModel(parsed,owner,"gemini","gemini-2.5-pro")).toBe(false);
    expect(allowsModel(parsed,owner,"openrouter","other/free")).toBe(false);
  });

  it.each([
    ["",[]],["[]",[]],["not-json",[]],
    [JSON.stringify([{...policy[0],credentialMode:"byok"}]),[owner]],
    [JSON.stringify([{...policy[0],secret:"plaintext"}]),[owner]],
    [JSON.stringify([{...policy[0],model:"vendor/../model"}]),[owner]],
    [JSON.stringify([{...policy[0],ownerId:other}]),[owner]],
    [JSON.stringify([policy[0],policy[0]]),[owner]],
    [JSON.stringify([{...policy[1],model:"provider/paid-model"}]),[owner]],
    ...["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash",
      "gemini-2.5-flash","gemini-3.1-pro-preview","gemini-3.5-flash"]
      .map(model => [JSON.stringify([{...policy[0],model}]),[owner]] as const)
  ])("fails closed for missing, BYOK, unknown, duplicate, or paid policy config", (raw, owners) => {
    expect(() => parseModelEntitlements(raw,owners)).toThrow();
  });

  it("allows all three approved Gemini Flash-Lite identifiers", () => {
    for (const model of ["gemini-3.5-flash-lite","gemini-3.1-flash-lite",
      "gemini-2.5-flash-lite"]) {
      const entitlements = parseModelEntitlements(JSON.stringify([{...policy[0],model}]),[owner]);
      expect(allowsModel(entitlements,owner,"gemini",model)).toBe(true);
      expect(allowsModel(entitlements,other,"gemini",model)).toBe(false);
    }
  });

  it("enforces the exact model at Worker claim as well as the API", async () => {
    const entitlement = parseModelEntitlements(JSON.stringify([policy[0]]),[owner]);
    const claim = { ownerId:owner, threadId:"t", turnId:"turn", runtime:"gemini" as const,
      model:"gemini-3.5-flash-lite",content:"hi" };
    const db = {
      claimNextQueuedTurn:vi.fn().mockResolvedValueOnce(claim).mockResolvedValue(null),
      appendGatewayEvents:vi.fn().mockResolvedValue(undefined)
    };
    const invoke = vi.fn(async () => ({events:[{
      type:"turn_completed",threadId:"t",turnId:"turn",payload:{status:"completed"}
    }]}));
    const worker = new ChatDispatcher(db,invoke,[owner],entitlement);
    expect(worker.canDispatch(owner)).toBe(false); // no implicit all-model access
    expect(worker.canDispatch(owner,"gemini","gemini-3.5-flash-lite")).toBe(true);
    expect(worker.canDispatch(owner,"codex","gpt-6-luna")).toBe(false);
    expect(await worker.runOnce()).toMatchObject({status:"completed"});
    expect(db.claimNextQueuedTurn).toHaveBeenCalledWith([owner],undefined,entitlement);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(claim);
  });

  it("lists only the exact models granted to an authenticated Owner", () => {
    const entitlement = parseModelEntitlements(JSON.stringify(policy),[owner]);
    const worker = new ChatDispatcher({ claimNextQueuedTurn:vi.fn(), appendGatewayEvents:vi.fn() },
      vi.fn(),[owner],entitlement);
    expect(worker.availableModels(owner)).toEqual([
      {runtime:"gemini",model:"gemini-3.5-flash-lite"},
      {runtime:"openrouter",model:"openrouter/free"}]);
    expect(worker.availableModels(other)).toEqual([]);
    expect(new ChatDispatcher({ claimNextQueuedTurn:vi.fn(),appendGatewayEvents:vi.fn() },
      vi.fn(),[owner]).availableModels(owner)).toEqual([]);
  });

  it("blocks an unapproved claim before provider invocation even if the store misbehaves", async () => {
    const entitlement = parseModelEntitlements(JSON.stringify([policy[0]]),[owner]);
    const db = {
      claimNextQueuedTurn:vi.fn().mockResolvedValue({
        ownerId:owner, threadId:"t",turnId:"turn",runtime:"codex",
        model:"gpt-6-luna",content:"hi"
      }),
      appendGatewayEvents:vi.fn()
    };
    const invoke = vi.fn();
    const worker = new ChatDispatcher(db,invoke,[owner],entitlement);
    await expect(worker.runOnce()).rejects.toThrow("reconciliation");
    expect(invoke).not.toHaveBeenCalled();
    expect(db.appendGatewayEvents).not.toHaveBeenCalled();
  });
});
