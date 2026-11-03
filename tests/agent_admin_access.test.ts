import {describe,it,expect,vi} from "vitest";
import {AgentAdminAccessStore,AgentAccessConflict,validateAgentAccess} from "../services/chat-api/agent_admin_access.js";
const owner="11111111-1111-4111-8111-111111111111";
const admin="22222222-2222-4222-8222-222222222222";
const row={ownerId:owner,models:[{runtime:"gemini",model:"gemini-2.5-flash-lite"}],tools:["calendar.read"]};
describe("Admin access drafts validate without granting effective authorization",()=>{
  it("accepts distinct public and paid model proposals and empty revocation draft",()=>{
    expect(validateAgentAccess([])).toEqual([]);
    const proposed={...row,models:[...row.models,
      {runtime:"gemini",model:"gemini-2.5-flash-lite",routeProfile:"private-lite"},
      {runtime:"gemini",model:"gemini-2.5-flash",routeProfile:"advanced-flash"}]};
    expect(validateAgentAccess([proposed])).toEqual([proposed]);
  });
  it("rejects unsupported models, paid profile mismatch, secrets and arbitrary fields",()=>{
    const invalid=[{...row,key:"secret"},{...row,ownerId:"forged"},
      {...row,models:[{runtime:"gemini",model:"gemini-2.5-pro"}]},
      {...row,models:[{runtime:"gemini",model:"gemini-2.5-flash-lite",routeProfile:"advanced-flash"}]},
      {...row,models:[{runtime:"openrouter",model:"vendor/paid"}]},
      {...row,models:[{runtime:"codex",model:"sk-do-not-persist"}]},
      {...row,models:[{runtime:"gemini",model:"gemini-2.5-flash-lite",apiKey:"secret"}]},
      {...row,tools:["calendar.read","calendar.read"]},{...row,tools:["gsk_must_not_persist"]}];
    for(const value of invalid)expect(()=>validateAgentAccess([value])).toThrow();
    expect(()=>validateAgentAccess([row,row])).toThrow();
    expect(()=>validateAgentAccess([{...row,models:[...row.models,...row.models]}])).toThrow();
    expect(()=>validateAgentAccess(Array(101).fill(row))).toThrow();
  });
  it("rejects invalid input before any persistence and keeps safe errors",async()=>{
    const query=vi.fn();const store=new AgentAdminAccessStore({query});
    await expect(store.save(admin,0,[{...row,key:"secret-value"}])).rejects.toThrow();
    await expect(store.save(admin,-1,[row])).rejects.toThrow();
    await expect(store.save("forged",0,[row])).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("saves version and audit atomically with compare-and-swap, then validates readback",async()=>{
    const query=vi.fn(async(sql:string,_args?:unknown[])=>sql.startsWith("SELECT")?{rows:[]}:
      {rows:[{version:1,owners:[row],updated_at:new Date("2026-11-03T00:00:00.000Z")}]});
    const store=new AgentAdminAccessStore({query});
    expect(await store.read()).toEqual({version:0,owners:[],updatedAt:null});
    expect(await store.save(admin,0,[row])).toEqual({version:1,owners:[row],updatedAt:"2026-11-03T00:00:00.000Z"});
    const [sql,args]=query.mock.calls[1];
    expect(sql).toContain("ON CONFLICT(singleton)");
    expect(sql).toContain("WHERE omni_chat.agent_admin_access.version=$1::integer");
    expect(sql).toContain("agent_admin_access_audit");
    expect(sql).toContain("FROM saved JOIN audit USING(version)");
    expect(args).toEqual([0,JSON.stringify([row]),admin]);
  });
  it("returns a conflict when a stale version updates no row",async()=>{
    const store=new AgentAdminAccessStore({query:async()=>({rows:[]})});
    await expect(store.save(admin,4,[row])).rejects.toBeInstanceOf(AgentAccessConflict);
  });
});
