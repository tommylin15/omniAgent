import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import {createQuotaPool} from "./model_quota_ledger.js";

export type ProviderIdentity={project:string;ownerId:string;requestId:string;
  provider:"gemini"|"openrouter"|"groq"|"codex";model:string;
  source:"assistant"|"agent"|"shared-gemini"|"codex-native";paidRequestId?:string;executionId?:string};
export type ActualProviderUsage={inputTokens:number;outputTokens:number;totalTokens:number};
export type ProviderCompletion={usage?:ActualProviderUsage;actualModel?:string;
  costMicros?:number;priceVersion?:string;costSource?:"paid_model_execution"};
export interface ProviderReceiptLedger{
  reserve(identity:ProviderIdentity):Promise<string>;
  started(executionId:string):Promise<void>;
  responded(executionId:string,status:number):Promise<void>;
  finish(executionId:string,state:"preflight_rejected"|"unknown"|"failed"|"completed",receipt?:ProviderCompletion):Promise<void>;
}
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const count=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
export class PgProviderReceiptLedger implements ProviderReceiptLedger{
  constructor(private readonly pool:Pick<Pool,"query">){}
  async reserve(r:ProviderIdentity):Promise<string>{
    if(!/^[a-z][a-z0-9-]{0,63}$/.test(r.project)||!UUID.test(r.ownerId)||!UUID.test(r.requestId)||
      !["gemini","openrouter","groq","codex"].includes(r.provider)||
      !["assistant","agent","shared-gemini","codex-native"].includes(r.source)||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,256}$/.test(r.model)||
      (r.paidRequestId!==undefined&&r.paidRequestId!==r.requestId)||
      (r.executionId!==undefined&&!UUID.test(r.executionId)))throw Error("provider_receipt_identity_invalid");
    const id=r.executionId??randomUUID();
    const result=await this.pool.query(`INSERT INTO omni_gateway.provider_execution_receipts
      (execution_id,project,owner_id,request_id,provider,model,source,paid_request_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING execution_id`,
      [id,r.project,r.ownerId,r.requestId,r.provider,r.model,r.source,r.paidRequestId??null]);
    if(result.rowCount!==1)throw Error("provider_receipt_duplicate_no_replay");return id;
  }
  async started(id:string):Promise<void>{
    const result=await this.pool.query(`UPDATE omni_gateway.provider_execution_receipts
      SET state='unknown',dispatch_started_at=now() WHERE execution_id=$1 AND state='reserved'`,[id]);
    if(result.rowCount!==1)throw Error("provider_receipt_dispatch_uncertain");
  }
  async responded(id:string,status:number):Promise<void>{
    if(!Number.isInteger(status)||status<100||status>599)throw Error("provider_receipt_status_invalid");
    const result=await this.pool.query(`UPDATE omni_gateway.provider_execution_receipts
      SET provider_responded_at=now(),upstream_status=$2 WHERE execution_id=$1 AND state='unknown' AND provider_responded_at IS NULL`,[id,status]);
    if(result.rowCount!==1)throw Error("provider_receipt_response_uncertain");
  }
  async finish(id:string,state:"preflight_rejected"|"unknown"|"failed"|"completed",receipt:ProviderCompletion={}):Promise<void>{
    const u=receipt.usage;
    const usage=u&&[u.inputTokens,u.outputTokens,u.totalTokens].every(count)&&u.totalTokens>=u.inputTokens+u.outputTokens?u:undefined;
    const priced=count(receipt.costMicros)&&typeof receipt.priceVersion==="string"&&
      receipt.priceVersion.length>0&&receipt.priceVersion.length<=200&&receipt.costSource==="paid_model_execution";
    const actualModel=typeof receipt.actualModel==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,256}$/.test(receipt.actualModel)
      ?receipt.actualModel:null;
    const result=await this.pool.query(`UPDATE omni_gateway.provider_execution_receipts SET
      state=$2,settled_at=now(),input_tokens=$3,output_tokens=$4,total_tokens=$5,actual_model=$6,
      cost_microusd=$7,price_version=$8,cost_source=$9
      WHERE execution_id=$1 AND state IN ('reserved','unknown')
        AND ($2<>'preflight_rejected' OR dispatch_started_at IS NULL)
        AND ($2<>'completed' OR (provider_responded_at IS NOT NULL AND upstream_status BETWEEN 200 AND 299))
        AND ($2<>'failed' OR (provider_responded_at IS NOT NULL AND upstream_status NOT BETWEEN 200 AND 299))
        AND ($7::bigint IS NULL OR EXISTS(SELECT 1 FROM omni_gateway.paid_model_execution b
          WHERE b.project=provider_execution_receipts.project AND b.owner_id=provider_execution_receipts.owner_id
            AND b.request_id=provider_execution_receipts.paid_request_id AND b.model=provider_execution_receipts.model
            AND b.status='settled' AND b.price_version=$8 AND b.actual_microusd=$7 AND b.actual_tokens=$5))`,
      [id,state,usage?.inputTokens??null,usage?.outputTokens??null,usage?.totalTokens??null,actualModel,
        priced?receipt.costMicros:null,priced?receipt.priceVersion:null,priced?receipt.costSource:null]);
    if(result.rowCount!==1)throw Error("provider_receipt_settlement_uncertain");
  }
}
let runtime:{pool:ReturnType<typeof createQuotaPool>;ledger:ProviderReceiptLedger}|undefined;
export function configuredProviderLedger(env:NodeJS.ProcessEnv=process.env):ProviderReceiptLedger|undefined{
  if(env.PROVIDER_LEDGER_ENABLED!=="true")return undefined;
  if(!runtime){
    if(new URL(env.GEMINI_SHARED_LEDGER_DATABASE_URL||"").pathname!=="/omniagent_gateway")
      throw Error("provider_receipt_gateway_database_required");
    const pool=createQuotaPool(env);runtime={pool,ledger:new PgProviderReceiptLedger(pool)};
  }
  return runtime.ledger;
}
export async function closeProviderLedger(){if(runtime)await runtime.pool.end();runtime=undefined;}
function inferenceUrl(provider:ProviderIdentity["provider"],input:Parameters<typeof fetch>[0]):boolean{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.toString():input.url);
  return provider==="gemini"?url.origin==="https://generativelanguage.googleapis.com"&&/^\/v1beta\/models\/[^/]+:generateContent$/.test(url.pathname):
    provider==="openrouter"?url.origin==="https://openrouter.ai"&&url.pathname==="/api/v1/chat/completions":
    provider==="groq"?url.origin==="https://api.groq.com"&&url.pathname==="/openai/v1/chat/completions":false;
}
/** Dispatch-started is deliberately distinct from provider-confirmed execution. */
export async function runProviderExecution<T>(identity:ProviderIdentity,
  operation:(fetcher:typeof fetch)=>Promise<{value:T;receipt?:ProviderCompletion}>,
  options:{ledger?:ProviderReceiptLedger|null;fetcher?:typeof fetch}={}):Promise<T>{
  const ledger=options.ledger===null?undefined:options.ledger??configuredProviderLedger();const fetcher=options.fetcher??fetch;
  if(!ledger)return (await operation(fetcher)).value;
  const executionId=await ledger.reserve(identity);
  let started=false,status:number|undefined,finished=false;
  const recordedFetch:typeof fetch=async(input,init)=>{
    if(!inferenceUrl(identity.provider,input))return fetcher(input,init);
    if(started)throw Error("provider_receipt_multiple_inference_denied");
    await ledger.started(executionId);started=true;
    const response=await fetcher(input,init);status=response.status;
    try{await ledger.responded(executionId,status);}catch(e){await response.body?.cancel().catch(()=>undefined);throw e;}
    return response;
  };
  try{
    const result=await operation(recordedFetch);
    if(!started)throw Error("provider_receipt_no_inference_observed");
    await ledger.finish(executionId,"completed",result.receipt);finished=true;return result.value;
  }catch(e){
    if(!finished)await ledger.finish(executionId,!started?"preflight_rejected":
      status!==undefined&&(status<200||status>=300)?"failed":"unknown").catch(()=>undefined);
    throw e;
  }
}

// One actual-provider source; never add Chat-turn counts or the paid budget table to these rows.
export const UNIFIED_PROVIDER_SOURCE_SQL=`SELECT execution_id,project,owner_id,request_id,provider,
  COALESCE(actual_model,model) model,source,state,dispatch_started_at,provider_responded_at,upstream_status,
  input_tokens,output_tokens,total_tokens,cost_microusd,price_version,reserved_at created_at
  FROM omni_gateway.provider_execution_receipts
  UNION ALL
  SELECT e.execution_id,e.project,e.owner_id,e.request_id,'gemini',e.model,'legacy-shared-gemini',
    CASE WHEN e.status='completed' THEN 'completed' ELSE 'unknown' END,
    NULL::timestamptz,NULL::timestamptz,NULL::integer,
    NULL::bigint,NULL::bigint,e.provider_tokens::bigint,NULL::bigint,NULL::text,e.created_at
  FROM omni_gateway.router_usage_events e WHERE NOT EXISTS(
    SELECT 1 FROM omni_gateway.provider_execution_receipts p WHERE p.execution_id=e.execution_id)`;
