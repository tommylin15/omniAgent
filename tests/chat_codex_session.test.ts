import { describe, expect, it } from "vitest";
import { parseCodexPhase } from "../services/chat-api/codex_session_store.js";

const binding={ownerId:"00000000-0000-4000-8000-000000000001",
  threadId:"chat-thread",turnId:"chat-turn"};
const native={...binding,status:"AWAITING_APPROVAL",turnHandle:"private-handle",
  nativeThreadId:"native-thread",nativeTurnId:"native-turn",cursor:0,
  events:[{seq:0,type:"approval_request",threadId:"native-thread",
    turnId:"native-turn",payload:{
      ownerId:binding.ownerId,threadId:"native-thread",turnId:"native-turn",
      requestId:"17",paramsDigest:"sha256:"+"a".repeat(64),
      operation:"shell",expiresAt:new Date(Date.now()+180000).toISOString(),
      reason:"Requires sandbox confirmation"}}]};

describe("native Codex phase authorization before persistence", () => {
  it("maps private native IDs only to the authenticated Chat binding", () => {
    const parsed=parseCodexPhase(native,binding);
    expect(parsed.status).toBe("AWAITING_APPROVAL");
    expect(parsed.events[0].payload).toMatchObject({
      requestId:"17",operation:"shell",paramsDigest:"sha256:"+"a".repeat(64)});
    expect(parsed.events[0].payload).not.toHaveProperty("ownerId");
    expect(parsed.events[0].payload).not.toHaveProperty("threadId");
    expect(parsed.events[0].payload).not.toHaveProperty("turnId");
  });
  it("rejects a foreign or stale Codex owner/thread/turn", () => {
    for (const incorrect of [
      {...native,ownerId:"00000000-0000-4000-8000-000000000002"},
      {...native,threadId:"foreign"},
      {...native,turnId:"foreign"},
      {...native,events:[{...native.events[0],threadId:"other"}]},
      {...native,events:[{...native.events[0],turnId:"other"}]},
      {...native,events:[{...native.events[0],seq:2}]},
      {...native,events:[{...native.events[0],payload:{
        ...native.events[0].payload,refresh_token:"secret"}}]},
      {...native,events:[{...native.events[0],payload:{
        ...native.events[0].payload,paramsDigest:"bad"}}]},
    ]) expect(()=>parseCodexPhase(incorrect,binding)).toThrow();
  });
  it("denies a success without a matching terminal native event", () => {
    expect(()=>parseCodexPhase({...native,status:"COMPLETED"},binding)).toThrow();
    expect(()=>parseCodexPhase({...native,status:"IN_PROGRESS"},binding)).toThrow();
    expect(parseCodexPhase({...native,status:"IN_PROGRESS",cursor:-1,events:[]},binding)
      .status).toBe("IN_PROGRESS");
  });
});
