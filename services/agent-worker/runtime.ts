import {createHash} from "node:crypto";
import {fromJsonSchema,type JsonSchemaType} from "@modelcontextprotocol/client";
import {runBoundedAgentLoop,type AgentDecision,type AgentObservation,type AgentTool} from "../agent-gateway/agent_loop.js";
import {PgAgentRunStore,validateAgentPolicy,type AgentRun,type AgentCheckpoint} from "../chat-api/agent_runs.js";

export type RuntimeTool={name:string;description:string;inputSchema:Record<string,unknown>;
 risk:"L0"|"L1"|"L2";grant:string;
 call:(input:Record<string,unknown>,context:{ownerId:string;runId:string;actionId?:string},signal:AbortSignal)=>Promise<unknown>;
 readback?:(input:Record<string,unknown>,context:{ownerId:string;runId:string;actionId:string},signal:AbortSignal)=>Promise<unknown>;
 confirms?:(written:unknown,readback:unknown)=>boolean};
export type AgentGatewayRequest={ownerId:string;runId:string;question:string;
 observations:ReadonlyArray<AgentObservation>;tools:Array<{name:string;description:string;inputSchema:Record<string,unknown>}>;
 maxTokens:number;maxCostMicros:number};
// Authenticated Gateway adapter owns credentials, route, entitlement and price-version enforcement.
export type AgentGateway=(request:AgentGatewayRequest,signal:AbortSignal)=>Promise<{
 decision:AgentDecision;usage:{tokens:number;costMicros:number}}>;
export type RuntimeDependencies={store:PgAgentRunStore;gateway:AgentGateway;
 tools:(ownerId:string)=>Promise<RuntimeTool[]>};
function canonical(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(k=>
  `${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`;
 const serialized=JSON.stringify(value);
 if(serialized===undefined)throw new Error("invalid_agent_action_input");
 return serialized;
}
export function agentActionDigest(runId:string,tool:string,input:Record<string,unknown>):string{
 return createHash("sha256").update(canonical({runId,tool,input})).digest("hex");
}
export async function executeAgentRun(deps:RuntimeDependencies,ownerId:string,runId:string){
 const r=await deps.store.claim(ownerId,runId);
 if(!r)throw new Error("agent_run_not_claimable");
 const controller=new AbortController();
 let heartbeatBusy=false;
 const heartbeat=setInterval(()=>{
  if(heartbeatBusy)return;
  heartbeatBusy=true;
  void deps.store.heartbeat(r).catch(()=>controller.abort()).finally(()=>{heartbeatBusy=false;});
 },5000);
 try{return await executeClaim(deps,r,controller);}finally{clearInterval(heartbeat);controller.abort();}
}
async function executeClaim(deps:RuntimeDependencies,r:AgentRun,controller:AbortController){
 let state:AgentCheckpoint={...r.checkpoint};
 try{
  validateAgentPolicy(r.policy);
  if(![state.tokens,state.costMicros].every(n=>Number.isSafeInteger(n)&&n>=0)||
    state.tokens>r.policy.maxTokens||state.costMicros>r.policy.maxCostMicros||
    !Array.isArray(state.observations)||state.observations.length>r.policy.limits.maxToolCalls||
    !["ready","decision","tool"].includes(state.phase))throw new Error("invalid_agent_checkpoint");
  const remaining=r.policy.limits.timeoutMs-(Date.now()-new Date(r.created_at).getTime());
  if(!Number.isFinite(remaining)||remaining<100)throw new Error("agent_run_deadline_exceeded");
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(remaining)]);
  const tools=await new Promise<RuntimeTool[]>((resolve,reject)=>{
   const abort=()=>reject(new Error("agent_registry_timeout"));
   if(signal.aborted)return abort();
   signal.addEventListener("abort",abort,{once:true});
   void deps.tools(r.owner_id).then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));
  });
  const granted=tools.filter(t=>r.policy.grants.includes(t.grant)&&
    (t.risk==="L0"||t.risk==="L1"||(t.risk==="L2"&&r.policy.allowL2)));
  if(granted.length>128||new Set(granted.map(t=>t.name)).size!==granted.length)
   throw new Error("invalid_agent_tool_registry");
  const registry=new Map<string,AgentTool>();
  for(const t of granted){
   const validator=fromJsonSchema(t.inputSchema as unknown as JsonSchemaType)["~standard"];
   registry.set(t.name,{name:t.name,readOnly:true,validate:()=>true,call:async(args,callSignal)=>{
    // Only this guarded adapter can turn an L2 capability into a core tool.
    const input={...args};
    const checked=await validator.validate(input);
    if(checked.issues)throw new Error("invalid_tool_arguments");
    const context={ownerId:r.owner_id,runId:r.run_id};
    await deps.store.emit(r,"tool_request",{name:t.name,arguments:input});
    if(t.risk!=="L2"){
     const result=await t.call(input,context,callSignal);
     await deps.store.emit(r,"tool_result",{name:t.name,result});return result;
    }
    if(!t.readback||!t.confirms)throw new Error("agent_approval_required");
    const digest=agentActionDigest(r.run_id,t.name,input);
    const actionId=`${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;
    const pending=await deps.store.proposeAction(r,actionId,digest,t.name,input);
    if(pending?.status!=="approved"){
     state={...state,phase:"ready",toolCalls:Math.max(0,state.toolCalls-1),
      pendingDecision:{kind:"tool",name:t.name,arguments:input}};
     await deps.store.checkpoint(r,state);
     await deps.store.emit(r,"approval_request",{runId:r.run_id,actionId,paramsDigest:digest,name:t.name,arguments:input});
     throw new Error("agent_approval_required");
    }
    const mutation={...context,actionId};
    await deps.store.beginAction(r,actionId,agentActionDigest(r.run_id,t.name,input));
    await deps.store.emit(r,"approval_resolved",{actionId,approved:true});
    try{
     const written=await t.call(input,mutation,callSignal);
     const readback=await t.readback(input,mutation,callSignal);
     if(!t.confirms(written,readback))throw new Error("agent_write_readback_mismatch");
     await deps.store.actionResult(r,actionId,"confirmed",readback);
     await deps.store.emit(r,"tool_result",{name:t.name,actionId,result:readback});
     return readback;
    }catch{
     await deps.store.actionResult(r,actionId,"unknown",{reason:"readback_required"});
     throw new Error("agent_write_outcome_unknown");
    }
   }});
  }
  const result=await runBoundedAgentLoop({ownerId:r.owner_id,question:r.question,
   grants:new Set(registry.keys()),limits:{...r.policy.limits,timeoutMs:Math.floor(remaining)},
   initialState:state,signal,checkpoint:async next=>{
    state={...state,...next,...(next.phase==="ready"?{pendingDecision:undefined}:{})};await deps.store.checkpoint(r,state);
   }},async context=>{
    if(state.pendingDecision)return state.pendingDecision;
    const tokenBudget=r.policy.maxTokens-state.tokens,costBudget=r.policy.maxCostMicros-state.costMicros;
    if(tokenBudget<r.policy.maxDecisionTokens||costBudget<r.policy.maxDecisionCostMicros)
     throw new Error("agent_budget_exhausted");
    const response=await deps.gateway({ownerId:r.owner_id,runId:r.run_id,question:context.question,
     observations:context.observations,tools:granted.map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema})),
     maxTokens:r.policy.maxDecisionTokens,maxCostMicros:r.policy.maxDecisionCostMicros},signal);
    if(!response.usage||![response.usage.tokens,response.usage.costMicros].every(n=>Number.isSafeInteger(n)&&n>=0)||
      response.usage.tokens>r.policy.maxDecisionTokens||response.usage.costMicros>r.policy.maxDecisionCostMicros)
     throw new Error("agent_provider_usage_unknown_or_exceeded");
    state={...state,tokens:state.tokens+response.usage.tokens,costMicros:state.costMicros+response.usage.costMicros};
    await deps.store.checkpoint(r,state);
    await deps.store.emit(r,"usage",{tokens:response.usage.tokens,costMicros:response.usage.costMicros});
    return response.decision;
   },registry);
  await deps.store.finish(r,result.status==="completed"?"completed":
   state.phase==="ready"&&!state.pendingDecision?"failed":"blocked",result);
  return result;
 }catch{
  await deps.store.finish(r,"blocked",{reason:"agent_execution_unavailable_or_requires_reconciliation"});
  return {status:"blocked"};
 }
}
