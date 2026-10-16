import {describe,expect,it,vi} from "vitest";
import {NativeChatRuntime} from "../services/chat-api/runtime_dispatch.js";

const claim={ownerId:"owner-a",threadId:"thread-a",turnId:"turn-a",runtime:"codex" as const,model:"test",content:"hello"};
const context={ownerId:"owner-a",threadId:"thread-a",turnId:"turn-a",turnHandle:"handle-a",nativeThreadId:"native-thread",nativeTurnId:"native-turn"};
function store(){return {saveRuntimeBinding:vi.fn(),appendEvent:vi.fn(),requestApproval:vi.fn(),
  acquireRuntimeBinding:vi.fn(async()=>({...context,cursor:0,operationId:"operation-a"})),
  releaseRuntimeBinding:vi.fn(),runtimeTurns:vi.fn(async()=>[claim]),
  unforwardedApprovals:vi.fn(async()=>[] as string[]),markApprovalForwarded:vi.fn(),
  approvalDecision:vi.fn(async()=>({status:"APPROVED",params_digest:"sha256:"+"a".repeat(64),expires_at:new Date(Date.now()+60000)}))};}

describe("durable native Chat lifecycle",()=>{
  it("rejects a different native thread before recording events",async()=>{
    const db=store();
    await expect(new NativeChatRuntime(db,async()=>({...context,cursor:1,events:[
      {seq:1,threadId:"foreign-native",turnId:"native-turn",type:"text_delta",payload:{text:"wrong"}}
    ]})).start(claim)).rejects.toThrow("native event binding");
    expect(db.appendEvent).not.toHaveBeenCalled();
  });
  it("polls the durable handle and releases its updated cursor",async()=>{
    const db=store();const rpc=vi.fn(async()=>({...context,cursor:1,events:[
      {seq:1,threadId:"native-thread",turnId:"native-turn",type:"text_delta",payload:{delta:"中文"}}
    ]}));
    await new NativeChatRuntime(db,rpc).refreshThread("owner-a","thread-a");
    expect(rpc).toHaveBeenCalledWith("turn:events",{...context,cursor:0});
    expect(db.releaseRuntimeBinding).toHaveBeenCalledWith(expect.objectContaining({operationId:"operation-a"}),1);
    expect(db.appendEvent).toHaveBeenCalledWith("owner-a","thread-a","turn-a","native-turn-a-1","text_delta",{delta:"中文",text:"中文"});
  });
  it("rejects cursor gaps before persisting any native event",async()=>{
    const db=store();
    const rpc=vi.fn(async()=>({...context,cursor:5,events:[{ownerId:"owner-a",seq:1,type:"text_delta",payload:{text:"hello"}}]}));
    await expect(new NativeChatRuntime(db,rpc).start(claim)).rejects.toThrow("cursor");
    expect(db.appendEvent).not.toHaveBeenCalled();
  });
  it("persists the exact binding and approval before returning to the UI",async()=>{
    const db=store();
    const rpc=vi.fn(async()=>({...context,status:"AWAITING_APPROVAL",cursor:1,events:[
      {ownerId:"owner-a",seq:1,type:"approval_request",payload:{requestId:"request-a",operation:"shell",paramsDigest:"sha256:"+"a".repeat(64),expiresAt:new Date(Date.now()+60000).toISOString()}}
    ]}));
    expect((await new NativeChatRuntime(db,rpc).start(claim)).status).toBe("awaiting_approval");
    expect(db.saveRuntimeBinding).toHaveBeenCalled();
    expect(db.requestApproval).toHaveBeenCalledWith(expect.objectContaining({ownerId:"owner-a",threadId:"thread-a",turnId:"turn-a",requestId:"request-a"}));
    expect(db.appendEvent).toHaveBeenCalledWith("owner-a","thread-a","turn-a","native-turn-a-1","approval_request",expect.any(Object));
  });
  it("rejects a foreign response without persisting its runtime handle",async()=>{
    const db=store();
    const runtime=new NativeChatRuntime(db,async()=>({...context,ownerId:"owner-b",events:[]}));
    await expect(runtime.start(claim)).rejects.toThrow("binding");
    expect(db.saveRuntimeBinding).not.toHaveBeenCalled();
  });
  it("reports process loss as an error and never starts another native turn",async()=>{
    const db=store();const rpc=vi.fn(async()=>{throw new Error("missing process");});
    await new NativeChatRuntime(db,rpc).refreshThread("owner-a","thread-a");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("turn:events");
    expect(db.appendEvent).toHaveBeenCalledWith("owner-a","thread-a","turn-a",expect.any(String),"turn_error",{code:"runtime_outcome_uncertain"});
  });
  it("forwards a persisted decision after a busy HTTP attempt instead of losing it",async()=>{
    const db=store();db.unforwardedApprovals.mockResolvedValue(["request-a"]);
    const rpc=vi.fn(async()=>({...context,cursor:1,events:[{ownerId:"owner-a",seq:1,type:"turn_completed",payload:{status:"complete"}}]}));
    await new NativeChatRuntime(db,rpc).refreshThread("owner-a","thread-a");
    expect(db.markApprovalForwarded).toHaveBeenCalledWith("owner-a","thread-a","turn-a","request-a");
    expect(rpc).toHaveBeenCalledWith("approval",expect.objectContaining({requestId:"request-a",decision:"accept"}));
  });
});
