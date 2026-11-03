import {describe,it,expect,vi} from "vitest";
import {PgProviderReceiptLedger,runProviderExecution,configuredProviderLedger,
  UNIFIED_PROVIDER_SOURCE_SQL,type ProviderReceiptLedger} from "../services/agent-gateway/provider_receipts.js";
const identity={project:"omniagent",ownerId:"11111111-1111-4111-8111-111111111111",
  requestId:"22222222-2222-4222-8222-222222222222",provider:"gemini" as const,model:"gemini-2.5-flash-lite",source:"assistant" as const};
const inference="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
const ledger=()=>({reserve:vi.fn().mockResolvedValue("33333333-3333-4333-8333-333333333333"),
  started:vi.fn().mockResolvedValue(undefined),responded:vi.fn().mockResolvedValue(undefined),finish:vi.fn().mockResolvedValue(undefined)});
describe("actual provider receipts separate dispatch uncertainty from provider confirmation",()=>{
  it("flag OFF needs no credentials or database and preserves existing operations",async()=>{
    expect(configuredProviderLedger({})).toBeUndefined();
    expect(await runProviderExecution(identity,async()=>({value:"unchanged"}),{ledger:null})).toBe("unchanged");
  });
  it("model discovery and config failures never become provider attempts",async()=>{
    const l=ledger(),fetcher=vi.fn().mockResolvedValue(Response.json({models:[]}));
    await expect(runProviderExecution(identity,async f=>{
      await f("https://generativelanguage.googleapis.com/v1beta/models");throw Error("no_model");
    },{ledger:l,fetcher})).rejects.toThrow("no_model");
    expect(l.started).not.toHaveBeenCalled();expect(l.responded).not.toHaveBeenCalled();
    expect(l.finish).toHaveBeenCalledWith(expect.any(String),"preflight_rejected");
  });
  it("reserves and marks dispatch before fetch; records real token splits only",async()=>{
    const l=ledger();const order:string[]=[];
    l.reserve.mockImplementation(async()=>{order.push("reserve");return "id";});
    l.started.mockImplementation(async()=>{order.push("started");});
    const fetcher=vi.fn(async()=>{order.push("fetch");return Response.json({ok:true});});
    const receipt={usage:{inputTokens:3,outputTokens:7,totalTokens:10}};
    expect(await runProviderExecution(identity,async f=>{await f(inference,{method:"POST"});return {value:"done",receipt};},
      {ledger:l,fetcher})).toBe("done");
    expect(order).toEqual(["reserve","started","fetch"]);expect(l.responded).toHaveBeenCalledWith("id",200);
    expect(l.finish).toHaveBeenCalledWith("id","completed",receipt);
  });
  it("network ambiguity stays UNKNOWN, duplicate request is not sent again",async()=>{
    const l=ledger(),fetcher=vi.fn().mockRejectedValue(new TypeError("network"));
    await expect(runProviderExecution(identity,async f=>{await f(inference);return {value:0};},{ledger:l,fetcher})).rejects.toThrow();
    expect(l.finish).toHaveBeenCalledWith(expect.any(String),"unknown");
    l.reserve.mockRejectedValueOnce(Error("duplicate_no_replay"));
    await expect(runProviderExecution(identity,async f=>{await f(inference);return {value:0};},{ledger:l,fetcher})).rejects.toThrow("no_replay");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("429 records a provider rejection without a retry or invented usage",async()=>{
    const l=ledger(),fetcher=vi.fn().mockResolvedValue(new Response("",{status:429}));
    await expect(runProviderExecution(identity,async f=>{const r=await f(inference);if(!r.ok)throw Error("429");return {value:0};},
      {ledger:l,fetcher})).rejects.toThrow("429");
    expect(l.finish).toHaveBeenCalledWith(expect.any(String),"failed");expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("strict durable reservation failure prevents any provider request",async()=>{
    const l=ledger(),operation=vi.fn();l.reserve.mockRejectedValueOnce(Error("db_unavailable"));
    await expect(runProviderExecution(identity,operation,{ledger:l})).rejects.toThrow("db_unavailable");
    expect(operation).not.toHaveBeenCalled();
  });
  it("forbids a second inference request inside one execution receipt",async()=>{
    const l=ledger(),fetcher=vi.fn().mockResolvedValue(Response.json({ok:true}));
    await expect(runProviderExecution(identity,async f=>{await f(inference);await f(inference);return {value:0};},
      {ledger:l,fetcher})).rejects.toThrow("multiple_inference");expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("DB settlement persists UNKNOWN instead of estimates and unversioned prices",async()=>{
    const query=vi.fn().mockResolvedValue({rowCount:1,rows:[]});const l=new PgProviderReceiptLedger({query} as never);
    await l.finish("id","completed",{usage:{inputTokens:5,outputTokens:8,totalTokens:1},costMicros:0});
    expect(query.mock.calls[0][1]).toEqual(["id","completed",null,null,null,null,null,null,null]);
    await l.finish("id","completed",{usage:{inputTokens:5,outputTokens:8,totalTokens:13},costMicros:8,
      priceVersion:"verified-v1",costSource:"paid_model_execution"});
    expect(query.mock.calls[1][1].slice(2)).toEqual([5,8,13,null,8,"verified-v1","paid_model_execution"]);
    expect(query.mock.calls[1][0]).toContain("b.actual_microusd=$7");
    expect(query.mock.calls[1][0]).toContain("b.actual_tokens=$5");
  });
  it("persists bounded identity only and refuses an existing execution key",async()=>{
    const query=vi.fn().mockResolvedValueOnce({rowCount:1,rows:[]}).mockResolvedValueOnce({rowCount:0,rows:[]});
    const l=new PgProviderReceiptLedger({query} as never);
    const extra={...identity,prompt:"private-do-not-save",credential:"private-key-do-not-save"};
    await l.reserve(extra);
    expect(JSON.stringify(query.mock.calls)).not.toContain("private-do-not-save");
    expect(JSON.stringify(query.mock.calls)).not.toContain("private-key-do-not-save");
    await expect(l.reserve(identity)).rejects.toThrow("duplicate_no_replay");
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT DO NOTHING");
  });
  it("allows distinct Shared executions with one consumer request ID but rejects replay of the same execution",async()=>{
    const executions=new Set<string>();
    const query=vi.fn(async(_sql:string,params:unknown[])=>{
      const id=String(params[0]);const duplicate=executions.has(id);executions.add(id);
      return {rowCount:duplicate?0:1,rows:duplicate?[]:[{execution_id:id}]};
    });
    const l=new PgProviderReceiptLedger({query} as never);
    const first={...identity,source:"shared-gemini" as const,executionId:"33333333-3333-4333-8333-333333333333"};
    const second={...first,executionId:"44444444-4444-4444-8444-444444444444"};
    expect(await l.reserve(first)).toBe(first.executionId);
    expect(await l.reserve(second)).toBe(second.executionId);
    expect(query.mock.calls[0][1][3]).toBe(identity.requestId);
    expect(query.mock.calls[1][1][3]).toBe(identity.requestId);
    await expect(l.reserve(first)).rejects.toThrow("duplicate_no_replay");
  });
  it("unified source joins real receipts and deduplicates shared events by actual execution ID",()=>{
    expect(UNIFIED_PROVIDER_SOURCE_SQL).toContain("p.execution_id=e.execution_id");
    expect(UNIFIED_PROVIDER_SOURCE_SQL).not.toContain("omni_chat.turns");
    expect(UNIFIED_PROVIDER_SOURCE_SQL).not.toContain("FROM omni_gateway.paid_model_execution");
  });
});
