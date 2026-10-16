import {describe,expect,it,vi} from "vitest";
import {ChatMcp} from "../services/chat-api/mcp_dispatch.js";
const owner="11111111-1111-4111-8111-111111111111";
const policy=JSON.stringify({[owner]:{test:{configRef:"approved",tools:["test__read"]}}});
describe("Chat MCP grants",()=>{
  it("derives owner and tools from server policy",async()=>{
    const rpc=vi.fn(async()=>({tools:[]}));
    await new ChatMcp(policy,rpc).execute(owner,"test","call",{requestId:"request-1",toolName:"test__read",arguments:{path:"allowed"}});
    expect(rpc).toHaveBeenCalledWith("mcp/call",expect.objectContaining({ownerId:owner,configRef:"approved",toolGrants:["test__read"]}));
  });
  it("rejects foreign owners, tools and client-selected grants without RPC",async()=>{
    const rpc=vi.fn();const mcp=new ChatMcp(policy,rpc);
    await expect(mcp.execute("22222222-2222-4222-8222-222222222222","test","discover",{})).rejects.toThrow("granted");
    await expect(mcp.execute(owner,"test","call",{requestId:"request-1",toolName:"test__write"})).rejects.toThrow("granted");
    await expect(mcp.execute(owner,"test","discover",{toolGrants:[]})).rejects.toThrow("fields");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects empty tool grants instead of exposing every remote tool",()=>{
    expect(()=>new ChatMcp(JSON.stringify({[owner]:{test:{configRef:"approved",tools:[]}}}),vi.fn())).toThrow("policy");
  });
});
