import {createQuotaPool} from "./model_quota_ledger.js";
import {PaidGeminiProvider,jsonRecord} from "./gemini_paid_provider.js";
import {PgPaidBudgetLedger,type PaidBudgetCaps,type PaidPrice} from "./paid_budget.js";

export function createPaidRuntime(env:NodeJS.ProcessEnv=process.env){
  let resources:{provider:PaidGeminiProvider;pool:ReturnType<typeof createQuotaPool>}|undefined;
  return {
    provider(){
      if(resources)return resources.provider;
      const caps=JSON.parse(env.GEMINI_PAID_BUDGET_CAPS_JSON||"") as PaidBudgetCaps;
      const prices:unknown=JSON.parse(env.GEMINI_PAID_PRICES_JSON||"");
      if(!Array.isArray(prices)||prices.length>16||prices.some(p=>typeof jsonRecord(p).model!=="string")||
        new Set(prices.map(p=>p.model)).size!==prices.length)throw Error("paid_prices_UNKNOWN");
      const pool=createQuotaPool(env);
      try{
        const ledger=new PgPaidBudgetLedger(pool,caps,new Map(prices.map(p=>[p.model,p as PaidPrice])));
        const provider=PaidGeminiProvider.fromEnvironment(env,ledger);resources={pool,provider};return provider;
      }catch(e){void pool.end();throw e;}
    },
    async close(){if(resources)await resources.pool.end();resources=undefined;}
  };
}
