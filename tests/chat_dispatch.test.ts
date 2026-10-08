import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ChatDispatcher, makeSignedGatewayInvoker } from "../services/chat-api/gateway_dispatch.js";
import type { DispatchClaim } from "../services/chat-api/storage.js";

const claim: DispatchClaim = { ownerId:"owner-a", threadId:"thread-a", turnId:"turn-a",
  runtime:"gemini", model:"gemini-2.5-flash", content:"hello" };
const response = () => ({ events:[
  { type:"text_delta",threadId:"thread-a",turnId:"turn-a",payload:{text:"world"} },
  { type:"turn_completed",threadId:"thread-a",turnId:"turn-a",payload:{status:"complete"} }
] });
function store() {
  return { claimNextQueuedTurn: vi.fn().mockResolvedValueOnce(claim).mockResolvedValue(null),
    appendEvent: vi.fn().mockResolvedValue({}) };
}

describe("Chat -> Gateway durable one-shot dispatch", () => {
  it("persists only the claimed owner turn and does not repeat provider effects", async () => {
    const db=store();
    const invoke=vi.fn(async () => response());
    const worker=new ChatDispatcher(db,invoke,["owner-a"]);
    expect(await worker.runOnce()).toEqual({status:"completed",turnId:"turn-a"});
    expect(await worker.runOnce()).toEqual({status:"idle"});
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(db.appendEvent).toHaveBeenNthCalledWith(1,"owner-a","thread-a","turn-a",
      "gateway-turn-a-0","text_delta",{text:"world"});
    expect(db.appendEvent).toHaveBeenNthCalledWith(2,"owner-a","thread-a","turn-a",
      "gateway-turn-a-1","turn_completed",{status:"complete"});
  });

  it("rejects foreign Gateway turn bindings before writing any model text", async () => {
    const db=store();
    const worker=new ChatDispatcher(db,async () => ({ events:[
      {type:"turn_completed",threadId:"other-thread",payload:{status:"complete"}}
    ] }),["owner-a"]);
    expect(await worker.runOnce()).toEqual({
      status:"error",turnId:"turn-a",reason:"gateway_outcome_uncertain"
    });
    expect(db.appendEvent).toHaveBeenCalledTimes(1);
    expect(db.appendEvent).toHaveBeenCalledWith("owner-a","thread-a","turn-a",
      "gateway-turn-a-failed","turn_error",{code:"gateway_outcome_uncertain"});
  });

  it("quarantines incomplete events and credential-shaped response fields", async () => {
    for (const fake of [
      {events:[{type:"text_delta",payload:{text:"unfinished"}}]},
      {events:[{type:"turn_completed",payload:{refresh_token:"not-persisted"}}]},
      {events:[{type:"turn_completed",payload:{status:"done"}},
        {type:"turn_completed",payload:{status:"duplicate"}}]}
    ]) {
      const db=store();
      expect((await new ChatDispatcher(db,async()=>fake,["owner-a"]).runOnce()).status).toBe("error");
      expect(db.appendEvent).toHaveBeenCalledTimes(1);
      expect(db.appendEvent.mock.calls[0][4]).toBe("turn_error");
    }
  });

  it("never resubmits a claimed turn after an ambiguous provider failure", async () => {
    const db=store();
    const invoke=vi.fn(async()=>{throw new Error("provider details must not leak");});
    const worker=new ChatDispatcher(db,invoke,["owner-a"]);
    expect((await worker.runOnce()).reason).toBe("gateway_outcome_uncertain");
    expect(await worker.runOnce()).toEqual({status:"idle"});
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("fails closed on event persistence errors, requiring reconciliation", async () => {
    const db=store();
    db.appendEvent.mockRejectedValue(new Error("database down"));
    await expect(new ChatDispatcher(db,async()=>response(),["owner-a"]).runOnce())
      .rejects.toThrow("dispatch_persistence_needs_reconciliation");
  });

  it("maps Codex-native IDs to the claimed Chat owner and normalizes deltas", async () => {
    const db=store();
    db.claimNextQueuedTurn.mockReset().mockResolvedValueOnce({...claim,runtime:"codex"});
    const worker=new ChatDispatcher(db,async()=>({events:[
      {type:"text_delta",threadId:"native-thread",turnId:"native-turn",payload:{delta:"test"}},
      {type:"turn_completed",threadId:"native-thread",turnId:"native-turn",payload:{status:"completed"}}
    ]}),["owner-a"]);
    expect((await worker.runOnce()).status).toBe("completed");
    expect(db.appendEvent).toHaveBeenNthCalledWith(1,"owner-a","thread-a","turn-a",
      "gateway-turn-a-0","text_delta",{delta:"test",text:"test"});
  });
});

describe("Gateway private HTTP authentication", () => {
  it("uses exact timestamp-and-body HMAC, IAM ID token and owner-bound payload", async () => {
    const signingKey="0123456789abcdef0123456789abcdef";
    let observed: Record<string,unknown> = {};
    const fetcher=vi.fn(async(input: RequestInfo | URL,init?:RequestInit) => {
      expect(String(input)).toBe("https://tagged-gateway.example.com/internal/v1/assistant/turn");
      expect(init?.method).toBe("POST");
      const headers=new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-identity");
      const stamp=headers.get("X-OmniAgent-Timestamp")!;
      expect(Math.abs(Date.now()-Number(stamp))).toBeLessThan(60_000);
      const body=String(init?.body);
      expect(headers.get("X-OmniAgent-Signature")).toBe("v1="+
        createHmac("sha256",signingKey).update(stamp).update(".").update(body).digest("hex"));
      observed=JSON.parse(body) as Record<string,unknown>;
      return new Response(JSON.stringify(response()),{status:200});
    });
    const getToken=vi.fn(async() => "test-identity");
    const invoker=makeSignedGatewayInvoker({url:"https://tagged-gateway.example.com",
      audience:"https://gateway.example.com",signingKey,idToken:getToken,
      fetcher:fetcher as typeof fetch});
    expect(await invoker(claim)).toMatchObject(response());
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(observed).toMatchObject({ownerId:"owner-a",threadId:"thread-a",turnId:"turn-a",
      runtime:"gemini",messages:[{role:"user",content:"hello"}]});
    expect(observed).not.toHaveProperty("credential");
  });

  it("rejects insecure URL, query parameters and invalid signing configuration", () => {
    const base={url:"http://gateway.example.com",audience:"https://gateway.example.com",
      signingKey:"0123456789abcdef0123456789abcdef",idToken:async()=> "token"};
    expect(()=>makeSignedGatewayInvoker(base)).toThrow("unsafe");
    expect(()=>makeSignedGatewayInvoker({...base,url:"https://gateway.example.com/?x=1"})).toThrow("unsafe");
    expect(()=>makeSignedGatewayInvoker({...base,url:"https://gateway.example.com",
      signingKey:"short"})).toThrow("unsafe");
  });
});
