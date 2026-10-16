/**
 * R01: atomic, durable budget caps for the real Chat -> assistant/turn route.
 * Signed HMAC alone is not a cost gate. These limits are intentionally
 * conservative UTF-8 byte-based reservation units, not provider billing.
 */
export type ChatDispatchBudget=Readonly<{
  maxConcurrent:number;
  maxGlobalDailyCalls:number;
  maxOwnerDailyCalls:number;
  maxGlobalDailyTokens:number;
  maxOwnerDailyTokens:number;
  maxPromptBytes:number;
}>;
export function parseChatDispatchBudget(raw:string):ChatDispatchBudget {
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw Error("Chat dispatch budget unavailable");}
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed))
    throw Error("Chat dispatch budget unavailable");
  const obj=parsed as Record<string,unknown>;
  const names=["maxConcurrent","maxGlobalDailyCalls","maxOwnerDailyCalls",
    "maxGlobalDailyTokens","maxOwnerDailyTokens","maxPromptBytes"] as const;
  if(Object.keys(obj).sort().join(",")!==[...names].sort().join(","))
    throw Error("Chat dispatch budget unavailable");
  const max:{[K in keyof ChatDispatchBudget]:number}={
    maxConcurrent:2,maxGlobalDailyCalls:200,maxOwnerDailyCalls:20,
    maxGlobalDailyTokens:1_000_000,maxOwnerDailyTokens:100_000,maxPromptBytes:8192
  };
  const entries=names.map(name=>{
    const number=obj[name];
    if(typeof number!=="number"||!Number.isSafeInteger(number)||number<1||number>max[name])
      throw Error("Chat dispatch budget unavailable");
    return [name,number];
  });
  const cfg=Object.fromEntries(entries) as ChatDispatchBudget;
  if(cfg.maxOwnerDailyCalls>cfg.maxGlobalDailyCalls||
     cfg.maxOwnerDailyTokens>cfg.maxGlobalDailyTokens)
    throw Error("Chat dispatch budget unavailable");
  return cfg;
}
