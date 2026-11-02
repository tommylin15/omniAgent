import { afterEach,describe,expect,it,vi } from "vitest";
import type {AddressInfo} from "node:net";
import {makeChatServer} from "../services/chat-api/server.js";
import type {ChatStore} from "../services/chat-api/storage.js";
import {AgentAdminSettingsStore,AgentSettingsConflict,DEFAULT_AGENT_SETTINGS,
  parseAgentAdmins,validateAgentSettings} from "../services/chat-api/agent_admin_settings.js";

const ALICE="00000000-0000-4000-8000-000000000001";
const BOB="00000000-0000-4000-8000-000000000002";
const servers:ReturnType<typeof makeChatServer>[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(x=>
  new Promise<void>(done=>x.close(()=>done()))));});

describe("Admin settings contract",()=>{
  it("requires exact, distinct UUID Owner allowlist",()=>{
    expect(parseAgentAdmins(ALICE+","+BOB)).toEqual(new Set([ALICE,BOB]));
    expect(()=>parseAgentAdmins("")).toThrow();
    expect(()=>parseAgentAdmins("alice")).toThrow();
    expect(()=>parseAgentAdmins(ALICE+","+ALICE)).toThrow();
  });

  it("defaults paid routing, all tools and Agent execution OFF",()=>{
    const config=validateAgentSettings(DEFAULT_AGENT_SETTINGS);
    expect(config.controls).toMatchObject({requestPaidRouting:false,
      requestAgentExecution:false,requireWriteApproval:true});
    expect(Object.values(config.tools)).toEqual([false,false,false,false]);
    expect(config.models.advancedFlash).toBe("gemini-3.8-flash");
  });

  it("rejects secret injection, unsupported models, limit overrun and disabling approvals",()=>{
    expect(()=>validateAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,gemini_paid_api_key:"must never persist"
    })).toThrow();
    expect(()=>validateAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,models:{...DEFAULT_AGENT_SETTINGS.models,
        advancedFlash:"gemini-3.1-pro-preview"}
    })).toThrow();
    expect(()=>validateAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,limits:{...DEFAULT_AGENT_SETTINGS.limits,
        ownerDailyCalls:200,globalDailyCalls:100}
    })).toThrow();
    expect(()=>validateAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,controls:{...DEFAULT_AGENT_SETTINGS.controls,
        requireWriteApproval:false}
    })).toThrow();
    expect(()=>validateAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,agent:{...DEFAULT_AGENT_SETTINGS.agent,maxSteps:1,maxToolCalls:32}
    })).toThrow();
    expect(()=>validateAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,tools:{...DEFAULT_AGENT_SETTINGS.tools,drive:"yes"}
    })).toThrow();
  });

  it("accepts requested routing and tools as drafts, not as live entitlements",()=>{
    const cfg=validateAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,
      controls:{requestPaidRouting:true,requestAgentExecution:true,
        requireWriteApproval:true},
      tools:{life:true,janus:true,calendar:true,drive:true}
    });
    expect(cfg.controls.requestPaidRouting).toBe(true);
    expect(cfg.tools.janus).toBe(true);
  });

  it("uses versioned compare-and-swap SQL and atomic audit receipt",async()=>{
    const query=vi.fn(async(sql:string,_args?:unknown[])=>{
      if(sql.startsWith("SELECT"))return {rows:[]};
      return {rows:[{version:1,settings:DEFAULT_AGENT_SETTINGS,
        updated_at:"2026-11-02T00:00:00.000Z"}]};
    });
    const store=new AgentAdminSettingsStore({query});
    const before=await store.read();
    expect(before.version).toBe(0);
    const saved=await store.save(ALICE,0,DEFAULT_AGENT_SETTINGS);
    expect(saved.version).toBe(1);
    expect(query.mock.calls[1][0]).toContain("ON CONFLICT(singleton)");
    expect(query.mock.calls[1][0]).toContain("agent_admin_settings_audit");
    expect(query.mock.calls[1][1]).toEqual([0,JSON.stringify(DEFAULT_AGENT_SETTINGS),ALICE]);
  });

  it("rejects stale versions and invalid owner before DB operations",async()=>{
    const query=vi.fn(async()=>({rows:[]}));
    const store=new AgentAdminSettingsStore({query});
    await expect(store.save(ALICE,7,DEFAULT_AGENT_SETTINGS))
      .rejects.toBeInstanceOf(AgentSettingsConflict);
    await expect(store.save("fake-owner",0,DEFAULT_AGENT_SETTINGS)).rejects.toThrow();
    await expect(store.save(ALICE,-1,DEFAULT_AGENT_SETTINGS)).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("OAuth-bound Admin HTTP contract",()=>{
  async function app(){
    const store={owner:vi.fn(async(_issuer:string,subject:string)=>
      subject==="admin"?ALICE:BOB),ready:vi.fn(async()=>{})};
    const draft={version:0,settings:DEFAULT_AGENT_SETTINGS,updatedAt:null};
    const settings={read:vi.fn(async()=>draft),
      save:vi.fn(async()=>({version:1,settings:DEFAULT_AGENT_SETTINGS,
        updatedAt:"2026-11-02T01:00:00.000Z"}))};
    const server=makeChatServer(store as unknown as ChatStore,async token=>{
      if(token==="admin"||token==="visitor")
        return {issuer:"https://accounts.google.com",subject:token};
      throw Error("unauthorized");
    },async()=>{throw Error("unauthorized");},undefined,undefined,undefined,
    {admins:new Set([ALICE]),settings});
    servers.push(server);
    await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
    const base="http://127.0.0.1:"+(server.address() as AddressInfo).port;
    return {base,settings};
  }

  it("has no Admin data for anonymous or ordinary Owner and verifies /me flag",async()=>{
    const {base,settings}=await app();
    expect((await fetch(base+"/v1/admin/agent-settings")).status).toBe(401);
    expect((await fetch(base+"/v1/admin/agent-settings",{
      headers:{authorization:"Bearer visitor"}
    })).status).toBe(403);
    expect((await fetch(base+"/v1/admin/agent-settings",{
      headers:{authorization:"Bearer injected"}
    })).status).toBe(401);
    const visitor=await fetch(base+"/v1/me",{headers:{authorization:"Bearer visitor"}});
    expect((await visitor.json()).agentAdminEnabled).toBe(false);
    const admin=await fetch(base+"/v1/me",{headers:{authorization:"Bearer admin"}});
    expect((await admin.json()).agentAdminEnabled).toBe(true);
    expect(settings.read).not.toHaveBeenCalled();
  });

  it("exposes drafts only and rejects user attempts to alter Owner or write secrets",async()=>{
    const {base,settings}=await app();
    const read=await fetch(base+"/v1/admin/agent-settings",{
      headers:{authorization:"Bearer admin"}});
    expect(read.status).toBe(200);
    const payload=await read.json() as Record<string,any>;
    expect(payload.effective).toMatchObject({activation:"draft_only",
      paidRoutingEnabled:false,agentExecutionEnabled:false,toolsConnected:false});
    expect(JSON.stringify(payload)).not.toContain("API_KEY");
    const update=async(body:unknown,token="admin")=>fetch(base+"/v1/admin/agent-settings",{
      method:"PUT",headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify(body)
    });
    expect((await update({expectedVersion:0,settings:DEFAULT_AGENT_SETTINGS,
      ownerId:BOB})).status).toBe(400);
    expect((await update({expectedVersion:0,settings:{
      ...DEFAULT_AGENT_SETTINGS,apiKey:"secret"
    }})).status).toBe(400);
    expect((await update({expectedVersion:0,settings:DEFAULT_AGENT_SETTINGS},
      "visitor")).status).toBe(403);
    expect(settings.save).not.toHaveBeenCalled();
    const ok=await update({expectedVersion:0,settings:DEFAULT_AGENT_SETTINGS});
    expect(ok.status).toBe(200);
    expect((await ok.json()).effective.paidRoutingEnabled).toBe(false);
    expect(settings.save).toHaveBeenCalledExactlyOnceWith(ALICE,0,DEFAULT_AGENT_SETTINGS);
  });
});