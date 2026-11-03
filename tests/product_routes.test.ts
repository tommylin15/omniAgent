import {afterEach,describe,expect,it,vi} from "vitest";
import type {AddressInfo} from "node:net";
import type {Server} from "node:http";
import {makeChatServer} from "../services/chat-api/server.js";
import {ChatNotFound,type ChatStore} from "../services/chat-api/storage.js";
import type {ProductServices} from "../services/chat-api/product_routes.js";

const owner="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>s.close(()=>resolve()))));});
async function harness(products:ProductServices={}){
  const store={owner:async(_issuer:string,subject:string)=>subject==="owner"?owner:other,
    thread:async(o:string)=>{if(o!==owner)throw new ChatNotFound("missing");return {thread_id:"thread"};},
    message:vi.fn(async()=>({turn:{turn_id:"33333333-3333-4333-8333-333333333333"}}))};
  const server=makeChatServer(store as unknown as ChatStore,async token=>{
    if(!["owner","other"].includes(token))throw Error("unauthorized");
    return {issuer:"https://accounts.google.com",subject:token};
  },async()=>{throw Error("unauthorized");},undefined,undefined,undefined,undefined,products);
  servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  return {store,url:`http://127.0.0.1:${(server.address() as AddressInfo).port}`};
}
describe("Owner-authenticated product entrypoints",()=>{
  it("keeps new capabilities disabled without configuration",async()=>{
    const f=await harness();
    const value=await fetch(f.url+"/v1/capabilities",{headers:{Authorization:"Bearer owner"}});
    expect(await value.json()).toMatchObject({agentEnabled:false,artifactsEnabled:false,jobsEnabled:false,mcpEnabled:false});
    expect((await fetch(f.url+"/v1/jobs",{headers:{Authorization:"Bearer owner"}})).status).toBe(404);
    expect((await fetch(f.url+"/v1/capabilities")).status).toBe(401);
  });
  it("takes policy from backend and never from request body",async()=>{
    const create=vi.fn();
    const f=await harness({agent:{policyFor:o=>o===owner?{} as never:undefined,
      runs:{create} as never,execute:vi.fn()}});
    const response=await fetch(f.url+"/v1/threads/thread/agent-runs",{method:"POST",
      headers:{Authorization:"Bearer owner","Content-Type":"application/json","Idempotency-Key":"intent"},
      body:JSON.stringify({content:"hello",policy:{allowL2:true}})});
    expect(response.status).toBe(400);expect(create).not.toHaveBeenCalled();expect(f.store.message).not.toHaveBeenCalled();
  });
  it("rejects ungranted Owners before reserving an Agent turn",async()=>{
    const create=vi.fn();const f=await harness({agent:{policyFor:()=>undefined,runs:{create} as never,execute:vi.fn()}});
    const response=await fetch(f.url+"/v1/threads/thread/agent-runs",{method:"POST",headers:{Authorization:"Bearer other"},body:'{"content":"hello"}'});
    expect(response.status).toBe(404);expect(create).not.toHaveBeenCalled();expect(f.store.message).not.toHaveBeenCalled();
  });
  it("does not accept arbitrary workflow names or tool payloads",async()=>{
    const enqueue=vi.fn();const f=await harness({jobs:{enqueue} as never,workflowKeys:new Set(["weekly"])});
    const response=await fetch(f.url+"/v1/jobs",{method:"POST",headers:{Authorization:"Bearer owner"},
      body:JSON.stringify({workflowKey:"unknown",tool:"delete_everything"})});
    expect(response.status).toBe(400);expect(enqueue).not.toHaveBeenCalled();
  });
});
