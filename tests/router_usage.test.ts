import { afterEach,describe,expect,it,vi } from "vitest";
import type { AddressInfo } from "node:net";
import { makeChatServer } from "../services/chat-api/server.js";
import type { ChatStore } from "../services/chat-api/storage.js";
import { RouterUsageStats,parseUsageAdmins,parseUsageDays } from "../services/chat-api/router_usage.js";

const ALICE="00000000-0000-4000-8000-000000000001";
const BOB="00000000-0000-4000-8000-000000000002";
const servers: ReturnType<typeof makeChatServer>[]=[];
afterEach(async()=>{
  await Promise.all(servers.splice(0).map(x=>new Promise<void>(ok=>x.close(()=>ok()))));
});

function row(extra:Record<string,unknown>={}){
  return {day:"2026-10-17",project:"omniagent",ownerId:ALICE,
    provider:"gemini",model:"gemini-3.5-flash-lite",status:"completed",calls:2,
    tokens:null,...extra};
}
describe("router usage aggregation contract",()=>{
  it("limits time windows, validates admin set and rejects invalid parameters",()=>{
    expect([parseUsageDays(null),parseUsageDays("1"),parseUsageDays("30")]).toEqual([7,1,30]);
    expect(()=>parseUsageDays("90")).toThrow();
    expect(()=>parseUsageDays("-1")).toThrow();
    expect(()=>parseUsageAdmins("")).toThrow();
    expect(()=>parseUsageAdmins("owner-alice")).toThrow();
    expect(parseUsageAdmins(ALICE.toUpperCase()).has(ALICE)).toBe(true);
    expect(()=>parseUsageAdmins(ALICE+","+ALICE)).toThrow();
  });
  it("keeps sources separate, preserves missing tokens and executes bounded read-only SQL",async()=>{
    const chat={query:vi.fn(async(_sql:string,_args?:unknown[])=>({rows:[row()]}))};
    const gateway={query:vi.fn(async(_sql:string,_args?:unknown[])=>({rows:[
      row({project:"life-assistant",source:undefined,calls:3,tokens:"125",ownerId:BOB})
    ]}))};
    const result=await new RouterUsageStats(chat,gateway).read(7);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({source:"chat_turns",tokens:null,calls:2});
    expect(result.rows[1]).toMatchObject({source:"shared_gemini",tokens:125,calls:3});
    expect(result.sources).toEqual({chatTurns:"available",sharedGemini:"available"});
    expect(chat.query).toHaveBeenCalledWith(expect.stringContaining("omni_chat.turns"),[7]);
    expect(gateway.query).toHaveBeenCalledWith(expect.stringContaining("omni_gateway.model_execution_ledger"),[7]);
    const sql=chat.query.mock.calls[0][0];
    expect(sql).toContain("::timestamp AT TIME ZONE 'UTC'");
    expect(gateway.query.mock.calls[0][0]).toContain("::timestamp AT TIME ZONE 'UTC'");
    expect(sql).not.toContain("message_digest");
    expect(sql).not.toContain("payload");
    expect(JSON.stringify(result)).not.toContain("prompt");
  });
  it("exposes coverage when gateway is missing or unavailable instead of fake zeros",async()=>{
    const chat={query:vi.fn(async()=>({rows:[row()]}))};
    expect((await new RouterUsageStats(chat).read(1)).sources.sharedGemini).toBe("not_configured");
    const broken={query:vi.fn(async()=>{throw Error("secret failure");return {rows:[]};})};
    const result=await new RouterUsageStats(chat,broken).read(30);
    expect(result.sources.sharedGemini).toBe("unavailable");
    expect(result.rows).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("secret failure");
  });
  it("rejects malformed DB values rather than emit misleading totals",async()=>{
    const chat={query:vi.fn(async()=>({rows:[row({calls:"bogus"})]}))};
    await expect(new RouterUsageStats(chat).read(7)).rejects.toThrow("router_usage_result_invalid");
  });
});
describe("router usage OAuth Owner admin gate",()=>{
  async function app(){
    const store={owner:vi.fn(async(_iss:string,sub:string)=>sub==="admin"?ALICE:BOB),
      ready:vi.fn(async()=>undefined)};
    const stats={read:vi.fn(async()=>({
      generatedAt:"2026-10-17T00:00:00.000Z",days:7,timezone:"UTC",
      sources:{chatTurns:"available",sharedGemini:"not_configured"},truncated:false,rows:[row()]
    }))};
    const server=makeChatServer(store as unknown as ChatStore,
      async token=>{
        if(token==="admin"||token==="visitor")return {issuer:"https://accounts.google.com",subject:token};
        throw Error("unauthorized");
      },async()=>{throw Error("unauthorized");},undefined,undefined,{
        stats:stats as unknown as RouterUsageStats,admins:new Set([ALICE])
      });
    servers.push(server);
    await new Promise<void>(ok=>server.listen(0,"127.0.0.1",ok));
    return {base:"http://127.0.0.1:"+(server.address() as AddressInfo).port,stats};
  }
  it("requires real user auth and explicit server Owner allowlist",async()=>{
    const {base,stats}=await app();
    const anon=await fetch(base+"/v1/admin/router-usage");
    expect(anon.status).toBe(401);
    const visitor=await fetch(base+"/v1/admin/router-usage",{
      headers:{authorization:"Bearer visitor"}});
    expect(visitor.status).toBe(403);
    expect(stats.read).not.toHaveBeenCalled();
    const me=await fetch(base+"/v1/me",{headers:{authorization:"Bearer visitor"}});
    expect((await me.json()).routerStatsEnabled).toBe(false);
    const adminMe=await fetch(base+"/v1/me",{headers:{authorization:"Bearer admin"}});
    expect((await adminMe.json()).routerStatsEnabled).toBe(true);
    const bad=await fetch(base+"/v1/admin/router-usage?days=365",{
      headers:{authorization:"Bearer admin"}});
    expect(bad.status).toBe(400);
    expect(stats.read).not.toHaveBeenCalled();
    const ok=await fetch(base+"/v1/admin/router-usage?days=7",{
      headers:{authorization:"Bearer admin"}});
    expect(ok.status).toBe(200);
    expect(stats.read).toHaveBeenCalledOnce();
    expect(stats.read).toHaveBeenCalledWith(7);
  });
});
