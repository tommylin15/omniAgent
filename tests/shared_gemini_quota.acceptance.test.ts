import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe,expect,it } from "vitest";
import { PgModelQuotaLedger,ModelQuotaDenied,parseQuotaLimits,createQuotaPool } from
  "../services/agent-gateway/model_quota_ledger.js";
const dsn=process.env.PG_TEST_URL;
const a="00000000-0000-4000-8000-000000000001";
const b="00000000-0000-4000-8000-000000000002";
const req=(owner:string,n:number,project="omniagent")=>({
  project,ownerId:owner,requestId:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),
  prompt:"private content",model:"gemini-3.5-flash-lite",maxOutputTokens:512});
const limits={dailyGlobalCalls:5,dailyProjectCalls:4,dailyOwnerCalls:2,
  dailyGlobalTokens:25000,dailyProjectTokens:20000,dailyOwnerTokens:15000,maxRunning:2};
describe("quota configuration",()=>{
  it("requires exact positive bounded project/owner/global quota limits",()=>{
    expect(parseQuotaLimits(JSON.stringify(limits))).toEqual(limits);
    expect(()=>parseQuotaLimits(JSON.stringify({...limits,extra:2}))).toThrow();
    expect(()=>parseQuotaLimits(JSON.stringify({...limits,maxRunning:0}))).toThrow();
    expect(()=>parseQuotaLimits(JSON.stringify({...limits,dailyOwnerCalls:8}))).toThrow();
    expect(()=>createQuotaPool({GEMINI_SHARED_LEDGER_DATABASE_URL:dsn})).toThrow();
  });
});
describe.runIf(Boolean(dsn))("isolated gateway cross-instance quota ledger",()=>{
  it("serializes replicas, blocks replay, caps global concurrency and owner/day calls",async()=>{
    const u=new URL(dsn!);
    if(!["localhost","127.0.0.1"].includes(u.hostname)||u.pathname!=="/omniagent_acceptance")
      throw Error("never test quota against live database");
    const poolA=new Pool({connectionString:dsn,max:3});
    const poolB=new Pool({connectionString:dsn,max:3});
    try{
      const migration=readFileSync("infra/postgres/migrations/006_gateway_model_quota.sql","utf8");
      await poolA.query(migration);
      await poolA.query(migration);
      const ledgerA=new PgModelQuotaLedger(poolA,limits);
      const ledgerB=new PgModelQuotaLedger(poolB,limits);
      const first=req(a,101),second=req(b,102),replay=req(a,101);
      const races=await Promise.allSettled([ledgerA.reserve(first),ledgerB.reserve(replay)]);
      expect(races.filter(v=>v.status==="fulfilled")).toHaveLength(1);
      expect(races.filter(v=>v.status==="rejected")).toHaveLength(1);
      expect((races.find(v=>v.status==="rejected") as PromiseRejectedResult).reason)
        .toBeInstanceOf(ModelQuotaDenied);
      await ledgerB.reserve(second);
      await expect(ledgerA.reserve(req(b,103))).rejects.toMatchObject({code:"global_busy"});
      await ledgerA.settle(first,"completed",{promptTokens:10,candidateTokens:1,totalTokens:11});
      await ledgerB.reserve(req(a,104));
      // Release the other Owner's active lease; now only daily Owner limits
      // can reject the third request. Distinct denial gates stay testable.
      await ledgerB.settle(second,"failed");
      await expect(ledgerA.reserve(req(a,105))).rejects.toMatchObject({code:"quota_exhausted"});
      await ledgerA.settle(req(a,104),"completed");
      await expect(ledgerB.reserve(req(a,101))).rejects.toMatchObject({code:"duplicate_request"});
      const records=await poolA.query(
        "SELECT prompt_sha256,model,status,provider_tokens FROM omni_gateway.model_execution_ledger WHERE project='omniagent'");
      expect(records.rows).toHaveLength(3);
      expect(records.rows.some(row=>row.prompt_sha256==="private content")).toBe(false);
      expect(records.rows.filter(row=>row.status==="completed")).toHaveLength(2);
      const global=await poolA.query(
        "SELECT attempts FROM omni_gateway.model_daily_budget WHERE scope='global'");
      expect(global.rows[0].attempts).toBe(3);
    }finally{await Promise.all([poolA.end(),poolB.end()]);}
  });
});
