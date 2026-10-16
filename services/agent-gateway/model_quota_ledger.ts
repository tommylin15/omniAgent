/** R04: cross-instance, fail-closed immutable request and quota ledger.
 * Separate Gateway database, metadata only. Failed and uncertain requests
 * still consume allowance; retry with same requestId is never allowed.
 */
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { Pool } from "pg";
import type { GeminiUsage } from "./gemini_provider.js";
export type QuotaRequest=Readonly<{project:string;ownerId:string;requestId:string;
  model:string;prompt:string;maxOutputTokens:number}>;
export type QuotaLimits=Readonly<{dailyGlobalCalls:number;dailyProjectCalls:number;
  dailyOwnerCalls:number;dailyGlobalTokens:number;dailyProjectTokens:number;
  dailyOwnerTokens:number;maxRunning:number}>;
export interface ModelQuotaLedger {
  reserve(request:QuotaRequest):Promise<void>;
  settle(request:Pick<QuotaRequest,"project"|"requestId">,
    outcome:"completed"|"failed",usage?:GeminiUsage):Promise<void>;
}
export class ModelQuotaDenied extends Error {
  constructor(public readonly code:"duplicate_request"|"quota_exhausted"|"global_busy"){super(code);}
}
const ZERO="00000000-0000-0000-0000-000000000000";
const KEYS=["dailyGlobalCalls","dailyProjectCalls","dailyOwnerCalls",
  "dailyGlobalTokens","dailyProjectTokens","dailyOwnerTokens","maxRunning"] as const;
export function parseQuotaLimits(raw:string):QuotaLimits {
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw Error("quota_limits_invalid");}
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("quota_limits_invalid");
  const rows=value as Record<string,unknown>;
  if(Object.keys(rows).sort().join(",")!==[...KEYS].sort().join(","))
    throw Error("quota_limits_invalid");
  const obj=Object.fromEntries(KEYS.map(key=>{
    const number=rows[key];
    if(typeof number!=="number"||!Number.isSafeInteger(number)||number<=0||
       number>(key==="maxRunning"?10:1_000_000_000))throw Error("quota_limits_invalid");
    return [key,number];
  })) as QuotaLimits;
  if(obj.dailyOwnerCalls>obj.dailyProjectCalls||obj.dailyProjectCalls>obj.dailyGlobalCalls||
     obj.dailyOwnerTokens>obj.dailyProjectTokens||obj.dailyProjectTokens>obj.dailyGlobalTokens)
    throw Error("quota_limits_invalid");
  return obj;
}
export function createQuotaPool(env:NodeJS.ProcessEnv):Pool {
  const dsn=env.GEMINI_SHARED_LEDGER_DATABASE_URL;
  const ca=env.GEMINI_SHARED_LEDGER_CA_PEM;
  const suppliedHostname=env.GEMINI_SHARED_LEDGER_TLS_SERVERNAME;
  if(!dsn||!ca?.includes("-----BEGIN CERTIFICATE-----")||
     !ca.includes("-----END CERTIFICATE-----"))throw Error("quota_verified_database_unavailable");
  let url:URL;
  try{url=new URL(dsn);}catch{throw Error("quota_verified_database_unavailable");}
  if(!["postgres:","postgresql:"].includes(url.protocol)||
     url.searchParams.get("sslmode")!=="require"||!url.username||
     !url.hostname||!url.pathname||url.pathname==="/"||
     (isIP(url.hostname)!==0&&!suppliedHostname))throw Error("quota_verified_database_unavailable");
  const servername=suppliedHostname||url.hostname;
  if(!/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(servername))
    throw Error("quota_verified_database_unavailable");
  url.searchParams.delete("sslmode");
  return new Pool({connectionString:url.toString(),max:4,
    connectionTimeoutMillis:4000,statement_timeout:5000,
    ssl:{rejectUnauthorized:true,ca,servername}});
}
export class PgModelQuotaLedger implements ModelQuotaLedger {
  constructor(private readonly pool:Pick<Pool,"connect">,
    private readonly caps:QuotaLimits){}
  async reserve(req:QuotaRequest):Promise<void>{
    const ceiling=Buffer.byteLength(req.prompt,"utf8")+req.maxOutputTokens;
    if(!Number.isSafeInteger(ceiling)||ceiling<1)throw Error("quota_reservation_invalid");
    const digest=createHash("sha256").update(req.prompt).digest("hex");
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      // The same transactional lock serializes all instances and all projects.
      await client.query("SELECT pg_advisory_xact_lock(762014,40)");
      const dup=await client.query(
        "SELECT 1 FROM omni_gateway.model_execution_ledger WHERE project=$1 AND request_id=$2",
        [req.project,req.requestId]);
      if(dup.rowCount)throw new ModelQuotaDenied("duplicate_request");
      const inflight=await client.query<{count:string}>(
        "SELECT count(*)::text AS count FROM omni_gateway.model_execution_ledger WHERE status='reserved' AND lease_until>now()");
      if(Number(inflight.rows[0].count)>=this.caps.maxRunning)throw new ModelQuotaDenied("global_busy");
      const scopes=[
        ["global","*",ZERO,this.caps.dailyGlobalCalls,this.caps.dailyGlobalTokens],
        ["project",req.project,ZERO,this.caps.dailyProjectCalls,this.caps.dailyProjectTokens],
        ["owner",req.project,req.ownerId,this.caps.dailyOwnerCalls,this.caps.dailyOwnerTokens]
      ] as const;
      for(const [scope,project,owner,calls,tokens] of scopes){
        await client.query(`INSERT INTO omni_gateway.model_daily_budget(scope,project,owner_id,day_utc)
          VALUES ($1,$2,$3,(now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`,
          [scope,project,owner]);
        const budget=await client.query<{attempts:number;reserved_token_ceiling:string}>(
          `SELECT attempts,reserved_token_ceiling::text AS reserved_token_ceiling
             FROM omni_gateway.model_daily_budget
            WHERE scope=$1 AND project=$2 AND owner_id=$3
              AND day_utc=(now() AT TIME ZONE 'UTC')::date FOR UPDATE`,
          [scope,project,owner]);
        const row=budget.rows[0];
        if(!row||row.attempts>=calls||
           BigInt(row.reserved_token_ceiling)+BigInt(ceiling)>BigInt(tokens))
          throw new ModelQuotaDenied("quota_exhausted");
      }
      // Consume caps before the provider. Unknown or failed calls count too.
      for(const [scope,project,owner] of scopes)
        await client.query(`UPDATE omni_gateway.model_daily_budget
          SET attempts=attempts+1,reserved_token_ceiling=reserved_token_ceiling+$4
          WHERE scope=$1 AND project=$2 AND owner_id=$3
            AND day_utc=(now() AT TIME ZONE 'UTC')::date`,[scope,project,owner,ceiling]);
      await client.query(`INSERT INTO omni_gateway.model_execution_ledger
        (project,request_id,owner_id,prompt_sha256,model,status,reserved_token_ceiling,lease_until)
        VALUES($1,$2,$3,$4,$5,'reserved',$6,now()+interval '120 seconds')`,
        [req.project,req.requestId,req.ownerId,digest,req.model,ceiling]);
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
    finally{client.release();}
  }
  async settle(req:Pick<QuotaRequest,"project"|"requestId">,
    status:"completed"|"failed",usage?:GeminiUsage):Promise<void>{
    const value=usage?.totalTokens;
    const tokens=typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;
    const c=await this.pool.connect();
    try{
      const r=await c.query(`UPDATE omni_gateway.model_execution_ledger
        SET status=$3,settled_at=now(),provider_tokens=$4
        WHERE project=$1 AND request_id=$2 AND status='reserved'`,
        [req.project,req.requestId,status,tokens]);
      if(r.rowCount!==1)throw Error("quota_settlement_requires_reconciliation");
    }finally{c.release();}
  }
}
