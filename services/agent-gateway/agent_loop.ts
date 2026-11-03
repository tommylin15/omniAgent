/**
 * Deterministic bounded loop. The worker supplies durable checkpoints and
 * guarded model/tool adapters; this core never owns credentials or grants.
 */
export type AgentDecision =
  | {kind:"final";text:string}
  | {kind:"tool";name:string;arguments:Record<string,unknown>};
export type AgentObservation={origin:"untrusted_tool_result";name:string;result:unknown};
export type AgentTool={
  name:string;
  readOnly:true;
  call:(input:Record<string,unknown>,signal:AbortSignal)=>Promise<unknown>;
  validate:(input:Record<string,unknown>)=>boolean;
};
export type AgentLoopLimits={
  maxSteps:number;maxToolCalls:number;timeoutMs:number;maxToolOutputBytes:number;
};
export type AgentLoopRequest={
  ownerId:string;question:string;grants:ReadonlySet<string>;
  limits:AgentLoopLimits;signal?:AbortSignal;
  initialState?:{steps:number;toolCalls:number;observations:AgentObservation[];pendingDecision?:AgentDecision};
  checkpoint?:(state:{steps:number;toolCalls:number;observations:AgentObservation[];
    phase:"decision"|"tool"|"ready"},signal:AbortSignal)=>Promise<void>;
};
export type AgentLoopResult={
  status:"completed"|"denied"|"limit_exceeded"|"cancelled"|"tool_error";
  text?:string;reason?:string;steps:number;toolCalls:number;
  observations:ReadonlyArray<AgentObservation>;
};
export type AgentPlanner=(context:Readonly<{
  question:string;observations:ReadonlyArray<AgentObservation>;
  stepsRemaining:number;toolsRemaining:number;
}>,signal:AbortSignal)=>Promise<AgentDecision>;

const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const TOOL_ID=/^[a-z][a-z0-9_.-]{1,127}$/;
function validConfig(request:AgentLoopRequest):void{
  const l=request.limits;
  if(!UUID.test(request.ownerId)||!request.question.trim()||request.question.length>8192||
    !Number.isSafeInteger(l.maxSteps)||l.maxSteps<1||l.maxSteps>16||
    !Number.isSafeInteger(l.maxToolCalls)||l.maxToolCalls<1||l.maxToolCalls>32||
    !Number.isSafeInteger(l.timeoutMs)||l.timeoutMs<100||l.timeoutMs>600000||
    !Number.isSafeInteger(l.maxToolOutputBytes)||l.maxToolOutputBytes<1024||
    l.maxToolOutputBytes>65536||l.maxToolCalls>l.maxSteps*4)
    throw new Error("invalid_agent_loop_policy");
}
function isRecord(value:unknown):value is Record<string,unknown>{
  return !!value&&typeof value==="object"&&!Array.isArray(value);
}

async function boundedAwait<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)throw new Error("operation_aborted");
  return new Promise<T>((resolve,reject)=>{
    const onAbort=()=>reject(new Error("operation_aborted"));
    signal.addEventListener("abort",onAbort,{once:true});
    Promise.resolve().then(task).then(resolve,reject).finally(()=>
      signal.removeEventListener("abort",onAbort));
  });
}

export async function runBoundedAgentLoop(request:AgentLoopRequest,
  planner:AgentPlanner,registry:ReadonlyMap<string,AgentTool>):Promise<AgentLoopResult>{
  validConfig(request);
  const start=Date.now();
  const observations:AgentObservation[]=[...(request.initialState?.observations??[])];
  let toolCalls=request.initialState?.toolCalls??0,steps=request.initialState?.steps??0;
  if(!Number.isSafeInteger(steps)||steps<0||steps>request.limits.maxSteps||
     !Number.isSafeInteger(toolCalls)||toolCalls<0||toolCalls>request.limits.maxToolCalls||
     (request.initialState?.pendingDecision&&steps<1))
    throw new Error("invalid_agent_checkpoint");
  const deadline=AbortSignal.timeout(request.limits.timeoutMs);
  const signal=request.signal?AbortSignal.any([request.signal,deadline]):deadline;
  const aborted=()=>request.signal?.aborted
    ? outcome("cancelled","signal_aborted") : outcome("limit_exceeded","timeout");
  const outcome=(status:AgentLoopResult["status"],reason?:string,text?:string):AgentLoopResult=>
    ({status,...(reason?{reason}:{}),...(text?{text}:{}),steps,toolCalls,observations});
  const checkpoint=async(phase:"decision"|"tool"|"ready")=>{
    if(request.checkpoint)await boundedAwait(()=>request.checkpoint!({steps,toolCalls,
      observations:[...observations],phase},signal),signal);
  };
  let pending=request.initialState?.pendingDecision;
  for(let i=steps-(pending?1:0);i<request.limits.maxSteps;i++){
    if(signal.aborted)return aborted();
    if(Date.now()-start>=request.limits.timeoutMs)
      return outcome("limit_exceeded","timeout");
    if(!pending)steps++;
    let decision:AgentDecision;
    try{
      await checkpoint("decision");
      decision=pending??await boundedAwait(()=>planner({question:request.question,observations,
        stepsRemaining:request.limits.maxSteps-i-1,
        toolsRemaining:request.limits.maxToolCalls-toolCalls},signal),signal);
      pending=undefined;
    }catch{return signal.aborted?aborted():outcome("tool_error","planner_unavailable");}
    if(!isRecord(decision))return outcome("denied","invalid_model_decision");
    if(decision.kind==="final"){
      if(typeof decision.text!=="string"||!decision.text.trim()||
         Buffer.byteLength(decision.text,"utf8")>32768)
        return outcome("denied","invalid_final");
      return outcome("completed",undefined,decision.text);
    }
    if(decision.kind!=="tool"||typeof decision.name!=="string"||
       !TOOL_ID.test(decision.name)||!isRecord(decision.arguments))
      return outcome("denied","invalid_tool_request");
    if(!request.grants.has(decision.name))return outcome("denied","tool_not_granted");
    const tool=registry.get(decision.name);
    if(!tool||tool.name!==decision.name||tool.readOnly!==true)
      return outcome("denied","tool_unavailable_or_not_read_only");
    try{
      if(Buffer.byteLength(JSON.stringify(decision.arguments))>8192||!tool.validate(decision.arguments))
        return outcome("denied","invalid_tool_arguments");
    }catch{return outcome("denied","invalid_tool_arguments");}
    if(toolCalls>=request.limits.maxToolCalls)
      return outcome("limit_exceeded","tool_call_limit");
    toolCalls++;
    try{
      await checkpoint("tool");
      const result=await boundedAwait(()=>tool.call(decision.arguments,signal),signal);
      const serialized=JSON.stringify(result);
      if(serialized===undefined||Buffer.byteLength(serialized,"utf8")>
          request.limits.maxToolOutputBytes)
        return outcome("denied","tool_result_invalid_or_oversize");
      observations.push({origin:"untrusted_tool_result",name:decision.name,result});
      await checkpoint("ready");
    }catch{return signal.aborted?aborted():outcome("tool_error","tool_execution_failed");}
  }
  return outcome("limit_exceeded","decision_step_limit");
}
