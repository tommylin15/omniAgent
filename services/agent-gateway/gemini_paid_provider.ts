import {GeminiProviderError,type GeminiResult} from "./gemini_provider.js";
import {chooseGeminiRoute,type GeminiRouteProfile,type GeminiTrustClass} from "./gemini_route_policy.js";
import type {PaidBudgetLedger,PaidUsage} from "./paid_budget.js";
import {runProviderExecution} from "./provider_receipts.js";

type Json=Record<string,unknown>;
export type PaidCallIdentity={project:string;ownerId:string;requestId:string;model:string;
  profile:Exclude<GeminiRouteProfile,"public-lite">;trustedClass:GeminiTrustClass;ownerModelAuthorized:boolean;
  receiptSource?:"assistant"|"agent"};
export type PaidContentRequest=PaidCallIdentity & {contents:unknown[];systemInstruction?:unknown;
  tools?:unknown[];toolConfig?:unknown;maxOutputTokens:number;maxCostMicros?:number;maxTotalTokens?:number;signal?:AbortSignal};
export type PaidContentResult={body:Json;usage:PaidUsage;model:string;costMicros:number;priceVersion:string};
export const jsonRecord=(v:unknown):Json=>v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};
const integer=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const error=(status:number)=>new GeminiProviderError(status===429?"quota":status>=500?"provider_unavailable":"provider_error",status);
async function boundedJson(response:Response):Promise<Json>{
  if(!response.ok){await response.body?.cancel();throw error(response.status);}
  const reader=response.body?.getReader();
  if(!reader)throw Error("paid_provider_response_invalid");
  const chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;if(bytes>262144)throw Error("paid_provider_response_oversize");chunks.push(value);
  }}finally{await reader.cancel().catch(()=>undefined);}
  let parsed:unknown;
  try{parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw Error("paid_provider_response_invalid");}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("paid_provider_response_invalid");
  return parsed as Json;
}

/** REST contract: https://ai.google.dev/api/generate-content and /api/models.
 * Availability is verified with this paid key on every invocation; models.get does not prove Billing tier.
 */
export class PaidGeminiProvider {
  private constructor(private readonly key:string,private readonly models:ReadonlySet<string>,
    private readonly ledger:PaidBudgetLedger,private readonly fetcher:typeof fetch){}
  static fromEnvironment(env:NodeJS.ProcessEnv,ledger:PaidBudgetLedger,fetcher:typeof fetch=fetch):PaidGeminiProvider{
    if(env.GEMINI_PAID_ROUTING_ENABLED!=="true"||env.GEMINI_PAID_TIER_VERIFIED!=="true"||
      !env.GEMINI_PAID_BILLING_EVIDENCE_REF?.trim())throw Error("paid_gemini_disabled_or_billing_UNKNOWN");
    let bundle:Json,models:unknown;
    try{bundle=jsonRecord(JSON.parse(env.OMNIAGENT_PROVIDER_BUNDLE||""));
      models=JSON.parse(env.GEMINI_PAID_MODELS_JSON||"");}catch{throw Error("paid_gemini_configuration_invalid");}
    const key=bundle.gemini_paid_api_key;
    if(typeof key!=="string"||!key.trim()||!Array.isArray(models)||!models.length||models.length>16||
      !models.every(v=>typeof v==="string"&&/^gemini-[a-z0-9.-]{1,100}$/.test(v)))
      throw Error("paid_gemini_configuration_invalid");
    return new PaidGeminiProvider(key.trim(),new Set(models),ledger,fetcher);
  }
  async generateContent(r:PaidContentRequest):Promise<PaidContentResult>{
    if(!this.models.has(r.model)||!integer(r.maxOutputTokens)||r.maxOutputTokens<1||r.maxOutputTokens>8192||
      !Array.isArray(r.contents)||!r.contents.length||r.contents.length>32)
      throw Error("paid_request_invalid");
    const textContent=(value:unknown)=>{
      const c=jsonRecord(value);
      return Object.keys(c).every(k=>["role","parts"].includes(k))&&
        (c.role===undefined||c.role==="user"||c.role==="model")&&Array.isArray(c.parts)&&
        c.parts.length>0&&c.parts.length<=32&&c.parts.every(p=>{
          const part=jsonRecord(p);return Object.keys(part).length===1&&typeof part.text==="string";
        });
    };
    if(!r.contents.every(textContent)||(r.systemInstruction&&!textContent(r.systemInstruction))||
      (r.tools&&(!Array.isArray(r.tools)||r.tools.length>1||r.tools.some(t=>{
        const tool=jsonRecord(t);return Object.keys(tool).length!==1||
          !Array.isArray(tool.functionDeclarations)||tool.functionDeclarations.length>32;
      }))))throw Error("paid_only_text_and_function_tools_supported");
    const body={contents:r.contents,...(r.systemInstruction?{systemInstruction:r.systemInstruction}:{}),
      ...(r.tools?{tools:r.tools}:{}),...(r.toolConfig?{toolConfig:r.toolConfig}:{}),
      generationConfig:{maxOutputTokens:r.maxOutputTokens,candidateCount:1}};
    if(Buffer.byteLength(JSON.stringify(body),"utf8")>65536)throw Error("paid_prompt_oversize");
    // Entitlement and trust are checked before even a non-generating provider request.
    chooseGeminiRoute({...r,paidModelAllowlist:this.models,paidRoutingDeployed:true,paidKeyConfigured:true,
      paidTierVerified:true,providerModelVerified:true,budgetReservationVerified:true});
    const signal=r.signal?AbortSignal.any([r.signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000);
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model)}`;
    const headers={"content-type":"application/json","x-goog-api-key":this.key};
    const model=await boundedJson(await this.fetcher(url,{headers,signal}));
    if(model.name!==`models/${r.model}`||!Array.isArray(model.supportedGenerationMethods)||
      !model.supportedGenerationMethods.includes("generateContent")||
      !integer(model.inputTokenLimit)||model.inputTokenLimit<1||
      !integer(model.outputTokenLimit)||model.outputTokenLimit<r.maxOutputTokens)
      throw Error("paid_provider_model_unavailable");
    // Count the exact full generation request, including system text and function declarations.
    // https://ai.google.dev/api/tokens; no local estimates or invented usage.
    const counted=await boundedJson(await this.fetcher(`${url}:countTokens`,{method:"POST",headers,signal,
      body:JSON.stringify({generateContentRequest:{model:`models/${r.model}`,...body}})}));
    if(!integer(counted.totalTokens)||counted.totalTokens<1||counted.totalTokens>model.inputTokenLimit)
      throw Error("paid_input_tokens_UNKNOWN");
    await this.ledger.reserve({...r,inputCeiling:counted.totalTokens,outputCeiling:r.maxOutputTokens});
    return runProviderExecution({project:r.project,ownerId:r.ownerId,requestId:r.requestId,provider:"gemini",
      model:r.model,source:r.receiptSource??"assistant",paidRequestId:r.requestId},async fetcher=>{
    // Never automatically retry. Any failure after reserve keeps the durable full ceiling.
    const answer=await boundedJson(await fetcher(`${url}:generateContent`,{
      method:"POST",headers,signal,body:JSON.stringify(body)}));
    const u=jsonRecord(answer.usageMetadata);
    if(!integer(u.promptTokenCount)||u.promptTokenCount<1||!integer(u.candidatesTokenCount)||!integer(u.totalTokenCount)||
      u.totalTokenCount<u.promptTokenCount+u.candidatesTokenCount||
      (u.cachedContentTokenCount!==undefined&&u.cachedContentTokenCount!==0)||
      (u.toolUsePromptTokenCount!==undefined&&u.toolUsePromptTokenCount!==0))
      throw Error("paid_usage_UNKNOWN");
    const usage={promptTokens:u.promptTokenCount,candidateTokens:u.candidatesTokenCount,totalTokens:u.totalTokenCount};
    const receipt=await this.ledger.settle(r,usage);
    return {value:{body:answer,usage,model:r.model,...receipt},receipt:{actualModel:r.model,
      usage:{inputTokens:usage.promptTokens,outputTokens:usage.totalTokens-usage.promptTokens,totalTokens:usage.totalTokens},
      costMicros:receipt.costMicros,priceVersion:receipt.priceVersion,costSource:"paid_model_execution" as const}};
    },{fetcher:this.fetcher});
  }
  async generate(r:PaidCallIdentity & {prompt:string;maxOutputTokens:number;maxCostMicros?:number;signal?:AbortSignal}):Promise<GeminiResult>{
    if(typeof r.prompt!=="string"||!r.prompt.trim())throw Error("paid_prompt_invalid");
    const {body,usage}=await this.generateContent({...r,contents:[{role:"user",parts:[{text:r.prompt}]}]});
    const candidates=body.candidates;
    const candidate=jsonRecord(Array.isArray(candidates)&&candidates.length===1?candidates[0]:undefined);
    const content=jsonRecord(candidate.content);
    const parts=Array.isArray(content.parts)?content.parts:[];
    const text=parts.filter(p=>jsonRecord(p).thought!==true).map(p=>jsonRecord(p).text)
      .filter((v):v is string=>typeof v==="string").join("");
    if(candidate.finishReason!=="STOP"||jsonRecord(body.promptFeedback).blockReason||
      parts.some(p=>jsonRecord(p).functionCall)||!text.trim()||Buffer.byteLength(text)>32768)
      throw Error("paid_answer_incomplete_or_invalid");
    return {text,model:r.model,queriedAt:new Date().toISOString(),citations:[],searchQueries:[],usage,finishReason:"STOP"};
  }
}
