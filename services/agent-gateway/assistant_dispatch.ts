import { GeminiProvider } from "./gemini_provider.js";
import { OpenRouterProvider, type ChatMessage } from "./openrouter_provider.js";
import type { Json } from "./server.js";
import { isAllowedGeminiModel } from "./gemini_model_policy.js";
import { GroqProvider } from "./groq_provider.js";
import {executionKey} from "./credential_execution.js";
import {createPaidRuntime} from "./paid_runtime.js";
import {jsonRecord} from "./gemini_paid_provider.js";
import {runProviderExecution,type ProviderCompletion} from "./provider_receipts.js";

const paidRuntime=createPaidRuntime();
export const closePaidAssistant=()=>paidRuntime.close();

export type DispatchRequest = {
  ownerId: string;
  threadId: string;
  turnId: string;
  runtime: "openrouter" | "gemini" | "groq";
  model: string;
  messages: ChatMessage[];
  grounding?: boolean;
  credentialProfileId?:string;
  routeProfile?:"public-lite"|"private-lite"|"advanced-flash";
  continuation?: Record<string, Json>;
};

export async function dispatchAssistant(request: DispatchRequest): Promise<Json> {
  if(request.routeProfile&&request.routeProfile!=="public-lite")return dispatchAssistantCore(request,fetch,()=>{});
  return runProviderExecution({project:"omniagent",ownerId:request.ownerId,requestId:request.turnId,
    provider:request.runtime,model:request.model,source:"assistant"},async fetcher=>{
    let receipt:ProviderCompletion|undefined;
    const value=await dispatchAssistantCore(request,fetcher,r=>{receipt=r;});return {value,receipt};
  });
}
async function dispatchAssistantCore(request:DispatchRequest,fetcher:typeof fetch,
  report:(receipt:ProviderCompletion)=>void):Promise<Json>{
  if (!request.messages.length || request.messages.length > 100) throw new Error("assistant messages are invalid");
  if(request.routeProfile&&request.routeProfile!=="public-lite"){
    if(request.runtime!=="gemini"||request.credentialProfileId)throw Error("paid_route_unavailable");
    const entitlements=jsonRecord(JSON.parse(process.env.GEMINI_PAID_OWNER_MODELS_JSON||""));
    const allowed=entitlements[request.ownerId.toLowerCase()];
    if(!Array.isArray(allowed)||!allowed.every(v=>typeof v==="string")||!allowed.includes(request.model))
      throw Error("paid_model_not_entitled");
    if(request.grounding)throw Error("paid_grounding_price_UNKNOWN");
    const prompt=request.messages.map(m=>`${m.role}: ${m.content??""}`).join("\n");
    const result=await paidRuntime.provider().generate({project:"omniagent",ownerId:request.ownerId,
      requestId:request.turnId,model:request.model,profile:request.routeProfile,trustedClass:"private",
      ownerModelAuthorized:true,prompt,maxOutputTokens:512,signal:AbortSignal.timeout(60000)});
    return {events:[
      {eventId:`${request.turnId}-0`,seq:0,threadId:request.threadId,turnId:request.turnId,
        type:"text_delta",payload:{text:result.text},providerIds:{runtime:"gemini",model:result.model}},
      {eventId:`${request.turnId}-1`,seq:1,threadId:request.threadId,turnId:request.turnId,
        type:"turn_completed",payload:result,providerIds:{runtime:"gemini",model:result.model}}
    ],continuation:{runtime:"gemini",model:result.model}};
  }
  if(request.credentialProfileId&&!["gemini","openrouter","groq"].includes(request.runtime))
    throw Error("byok_runtime_unavailable");
  const key=request.credentialProfileId?await executionKey({...request,
    runtime:request.runtime,credentialProfileId:request.credentialProfileId}):undefined;
  if (request.runtime === "groq") {
    const result=await (key?new GroqProvider(key,fetcher):GroqProvider.fromEnvironment(fetcher)).complete(request.messages,request.model);
    report({actualModel:result.model,...(result.usage?{usage:{inputTokens:result.usage.promptTokens,
      outputTokens:result.usage.completionTokens,totalTokens:result.usage.totalTokens}}:{})});
    if(Buffer.byteLength(result.text,"utf8")>32_000)throw new Error("Groq output exceeds Chat limit");
    return {events:[
      {eventId:`${request.turnId}-0`,seq:0,threadId:request.threadId,turnId:request.turnId,
        type:"text_delta",payload:{text:result.text},providerIds:{runtime:"groq",model:result.model}},
      {eventId:`${request.turnId}-1`,seq:1,threadId:request.threadId,turnId:request.turnId,
        type:"turn_completed",payload:result,providerIds:{runtime:"groq",model:result.model}}
    ],continuation:{runtime:"groq",model:result.model}};
  }
  if (request.runtime === "openrouter") {
    const provider = key?new OpenRouterProvider(key,fetcher):OpenRouterProvider.fromEnvironment(fetcher);
    const model = request.model === "openrouter/free"
      ? (await provider.listModels(["streaming"]))[0]?.id
      : request.model;
    if (!model) throw new Error("OpenRouter has no approved free streaming model");
    const events: Json[] = [];
    let seq = 0;
    let completion:ProviderCompletion={};
    for await (const event of provider.stream(request.messages, { model })) {
      if(event.type==="usage")completion={...completion,usage:{inputTokens:event.usage.promptTokens,
        outputTokens:event.usage.completionTokens,totalTokens:event.usage.totalTokens}};
      if(event.type==="turn_completed")completion.actualModel=event.result.model;
      events.push({ eventId: `${request.turnId}-${seq}`, seq: seq++, threadId: request.threadId,
        turnId: request.turnId, type: event.type, payload: event.type === "text_delta" ? { text: event.delta } : event.type === "usage" ? event.usage : event.result,
        providerIds: { runtime: "openrouter", model } });
    }
    report(completion);
    return { events, continuation: { runtime: "openrouter", model } };
  }
  // Signed Gateway calls cannot bypass the Gemini model restriction.
  if (!isAllowedGeminiModel(request.model))
    throw new Error("Gemini model is not on the Flash-Lite allowlist");
  const prompt = request.messages.map((message) => `${message.role}: ${message.content ?? ""}`).join("\n");
  // Bound signed Chat Gateway inference to the previously accepted pilot limits.
  const result = await (key?new GeminiProvider(key,request.model,fetcher):GeminiProvider.fromEnvironment(fetcher, request.model)).generate(prompt, {
    grounding: request.grounding === true,
    maxOutputTokens: 512,
    signal: AbortSignal.timeout(60_000),
  });
  report({actualModel:result.model,...(result.usage?{usage:{inputTokens:result.usage.promptTokens,
    outputTokens:result.usage.totalTokens-result.usage.promptTokens,totalTokens:result.usage.totalTokens}}:{})});
  if (!result.text.trim() || Buffer.byteLength(result.text,"utf8") > 32_000)
    throw new Error("Gemini response is blank or exceeds Chat output limit");
  return { events: [
    { eventId: `${request.turnId}-0`, seq: 0, threadId: request.threadId, turnId: request.turnId,
      type: "text_delta", payload: { text: result.text }, providerIds: { runtime: "gemini", model: result.model } },
    { eventId: `${request.turnId}-1`, seq: 1, threadId: request.threadId, turnId: request.turnId,
      type: "turn_completed", payload: result, providerIds: { runtime: "gemini", model: result.model } },
  ], continuation: { runtime: "gemini", model: result.model } };
}
