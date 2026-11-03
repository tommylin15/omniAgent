import type {Pool} from "pg";

export type PaidUsage={promptTokens:number;candidateTokens:number;totalTokens:number};
export type PaidPrice={model:string;version:string;source:string;validUntil:string;
  inputMicrousdPerMillion:number;outputMicrousdPerMillion:number};
export type PaidBudgetCap={calls:number;tokens:number;microusd:number};
export type PaidBudgetCaps={ownerDay:PaidBudgetCap;ownerMonth:PaidBudgetCap;
  projectDay:PaidBudgetCap;projectMonth:PaidBudgetCap};
export type PaidReservation={project:string;ownerId:string;requestId:string;model:string;
  inputCeiling:number;outputCeiling:number;maxCostMicros?:number;maxTotalTokens?:number};
export interface PaidBudgetLedger {
  reserve(request:PaidReservation):Promise<void>;
  settle(request:Pick<PaidReservation,"project"|"requestId">,usage:PaidUsage):Promise<{costMicros:number;priceVersion:string}>;
}
const positive=(v:number)=>Number.isSafeInteger(v)&&v>0;
export function paidCost(price:PaidPrice,input:number,output:number):number {
  if(![input,output].every(v=>Number.isSafeInteger(v)&&v>=0)||
    !positive(price.inputMicrousdPerMillion)||!positive(price.outputMicrousdPerMillion)||
    !price.version||!/^https:\/\/ai\.google\.dev\//.test(price.source)||
    !Number.isFinite(Date.parse(price.validUntil))||Date.parse(price.validUntil)<=Date.now())
    throw Error("paid_price_or_usage_UNKNOWN");
  const result=(BigInt(input)*BigInt(price.inputMicrousdPerMillion)+
    BigInt(output)*BigInt(price.outputMicrousdPerMillion)+999999n)/1000000n;
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw Error("paid_cost_overflow");
  return Number(result);
}
export class PgPaidBudgetLedger implements PaidBudgetLedger {
  constructor(private readonly pool:Pick<Pool,"connect">,private readonly caps:PaidBudgetCaps,
    private readonly prices:ReadonlyMap<string,PaidPrice>) {
    for(const name of ["ownerDay","ownerMonth","projectDay","projectMonth"] as const){
      const cap=caps[name];
      if(!cap||![cap.calls,cap.tokens,cap.microusd].every(positive))throw Error("paid_budget_caps_invalid");
    }
  }
  async reserve(r:PaidReservation):Promise<void>{
    const price=this.prices.get(r.model);
    if(!price||price.model!==r.model)throw Error("paid_price_UNKNOWN");
    if(!/^[a-z][a-z0-9-]{0,63}$/.test(r.project)||
      ![r.ownerId,r.requestId].every(v=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v))||
      ![r.inputCeiling,r.outputCeiling].every(positive))throw Error("paid_reservation_invalid");
    const cost=paidCost(price,r.inputCeiling,r.outputCeiling);
    if(r.maxCostMicros!==undefined&&(!positive(r.maxCostMicros)||cost>r.maxCostMicros))
      throw Error("paid_request_cost_ceiling_exceeded");
    const tokens=r.inputCeiling+r.outputCeiling;
    if(!positive(tokens))throw Error("paid_reservation_invalid");
    if(r.maxTotalTokens!==undefined&&(!positive(r.maxTotalTokens)||tokens>r.maxTotalTokens))
      throw Error("paid_request_token_ceiling_exceeded");
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(762014,42)");
      const duplicate=await c.query("SELECT 1 FROM omni_gateway.paid_model_execution WHERE project=$1 AND request_id=$2",[r.project,r.requestId]);
      if(duplicate.rowCount)throw Error("paid_duplicate_request_no_replay");
      for(const name of ["ownerDay","ownerMonth","projectDay","projectMonth"] as const){
        const cap=this.caps[name];
        const owner=name.startsWith("owner");
        const period=name.endsWith("Day")?"day":"month";
        const totals=await c.query<{calls:string;tokens:string;cost:string}>(`SELECT count(*)::text calls,
          COALESCE(sum(COALESCE(actual_tokens,reserved_tokens)),0)::text tokens,
          COALESCE(sum(COALESCE(actual_microusd,reserved_microusd)),0)::text cost
          FROM omni_gateway.paid_model_execution WHERE project=$1
          AND ($2::uuid IS NULL OR owner_id=$2::uuid)
          AND reserved_at >= date_trunc('${period}',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
          [r.project,owner?r.ownerId:null]);
        const t=totals.rows[0];
        if(BigInt(t.calls)+1n>BigInt(cap.calls)||BigInt(t.tokens)+BigInt(tokens)>BigInt(cap.tokens)||
          BigInt(t.cost)+BigInt(cost)>BigInt(cap.microusd))throw Error("paid_budget_exhausted");
      }
      await c.query(`INSERT INTO omni_gateway.paid_model_execution
        (project,request_id,owner_id,model,price_version,price_source,input_rate,output_rate,
         input_ceiling,output_ceiling,reserved_tokens,reserved_microusd)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [r.project,r.requestId,r.ownerId,r.model,price.version,price.source,
          price.inputMicrousdPerMillion,price.outputMicrousdPerMillion,r.inputCeiling,r.outputCeiling,tokens,cost]);
      await c.query("COMMIT");
    }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
  }
  async settle(r:Pick<PaidReservation,"project"|"requestId">,u:PaidUsage):Promise<{costMicros:number;priceVersion:string}>{
    if(![u.promptTokens,u.candidateTokens,u.totalTokens].every(v=>Number.isSafeInteger(v)&&v>=0)||
      u.totalTokens<u.promptTokens+u.candidateTokens)throw Error("paid_usage_UNKNOWN");
    const c=await this.pool.connect();
    try{
      // No expiry releases: ambiguous executions retain their entire reservation until reconciled.
      const result=await c.query<{cost:string;price_version:string}>(`UPDATE omni_gateway.paid_model_execution SET
        actual_tokens=$3,actual_microusd=ceil(($4::numeric*input_rate+($3::numeric-$4::numeric)*output_rate)/1000000),
        prompt_tokens=$4,candidate_tokens=$5,status='settled',settled_at=now()
        WHERE project=$1 AND request_id=$2 AND status='reserved'
          AND $4<=input_ceiling AND $3-$4<=output_ceiling
        RETURNING actual_microusd::text cost,price_version`,
        [r.project,r.requestId,u.totalTokens,u.promptTokens,u.candidateTokens]);
      if(result.rowCount!==1)throw Error("paid_settlement_requires_reconciliation");
      const costMicros=Number(result.rows[0].cost);
      if(!Number.isSafeInteger(costMicros)||costMicros<0)throw Error("paid_settlement_requires_reconciliation");
      return {costMicros,priceVersion:result.rows[0].price_version};
    }finally{c.release();}
  }
}
