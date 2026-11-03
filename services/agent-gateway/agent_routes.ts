import {fromJsonSchema,type JsonSchemaType} from "@modelcontextprotocol/client";
import {isDeepStrictEqual} from "node:util";
import {createHash} from "node:crypto";
import {GoogleAuth,OAuth2Client} from "google-auth-library";
import type {McpHost} from "./mcp_host.js";
import {jsonRecord} from "./gemini_paid_provider.js";
import {createPaidRuntime} from "./paid_runtime.js";
import {createGeminiAgentPlanner,type PlannerTool} from "./agent_planner.js";
import type {AgentObservation} from "./agent_loop.js";
import {serviceTargetMatches} from "./service_target.js";

type Binding={name:string;serverId:string;configRef:string;risk:"L0"|"L1"|"L2";
  readbackToolName?:string;actionIdArgument?:string};
type OwnerPolicy={model:string;tools:Binding[]};
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const identifier=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export async function authenticateAgentGateway(authorization:unknown,env:NodeJS.ProcessEnv,
  verify:(token:string,audience:string)=>Promise<{email?:string;email_verified?:boolean}|undefined>=
    async(token,audience)=>(await new OAuth2Client().verifyIdToken({idToken:token,audience})).getPayload()):Promise<void>{
  const audience=env.AGENT_GATEWAY_AUDIENCE;
  const callers=(env.AGENT_GATEWAY_CALLER_EMAILS||"").split(",").map(v=>v.trim()).filter(Boolean);
  if(!audience||!/^https:\/\/[^/?#]+\/?$/.test(audience)||!callers.length||
    callers.some(v=>!/^[-a-z0-9.]+@[-a-z0-9]+\.iam\.gserviceaccount\.com$/.test(v))||
    typeof authorization!=="string"||!/^Bearer \S+$/.test(authorization))throw Error("agent_gateway_unauthenticated");
  const claim=await verify(authorization.slice(7),audience);
  if(claim?.email_verified!==true||!claim.email||!callers.includes(claim.email))throw Error("agent_gateway_unauthenticated");
}
export function parseAgentGatewayPolicy(raw:string):Map<string,OwnerPolicy>{
  const value=jsonRecord(JSON.parse(raw));const result=new Map<string,OwnerPolicy>();
  if(Object.keys(value).length>256)throw Error("agent_gateway_policy_invalid");
  for(const [owner,p]of Object.entries(value)){
    const policy=jsonRecord(p);
    if(!UUID.test(owner)||Object.keys(policy).some(k=>!["model","tools"].includes(k))||
      typeof policy.model!=="string"||!/^gemini-[a-z0-9.-]{1,100}$/.test(policy.model)||
      !Array.isArray(policy.tools)||policy.tools.length>32)throw Error("agent_gateway_policy_invalid");
    const tools:Binding[]=policy.tools.map(t=>{
      const b=jsonRecord(t);
      if(Object.keys(b).some(k=>!["configRef","name","risk","serverId","readbackToolName","actionIdArgument"].includes(k))||
        typeof b.name!=="string"||!/^[a-z][a-z0-9_.-]{1,127}$/.test(b.name)||
        typeof b.serverId!=="string"||!identifier.test(b.serverId)||
        typeof b.configRef!=="string"||!identifier.test(b.configRef)||
        !b.name.startsWith(`${b.serverId}__`)||!["L0","L1","L2"].includes(String(b.risk))||
        (b.risk==="L2"?(typeof b.readbackToolName!=="string"||!/^[a-z][a-z0-9_.-]{1,127}$/.test(b.readbackToolName)||
          !b.readbackToolName.startsWith(`${b.serverId}__`)||b.readbackToolName===b.name||
          typeof b.actionIdArgument!=="string"||!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(b.actionIdArgument)):
          b.readbackToolName!==undefined||b.actionIdArgument!==undefined))
        throw Error("agent_gateway_policy_invalid");
      return b as Binding;
    });
    if(new Set(tools.map(t=>t.name)).size!==tools.length)throw Error("agent_gateway_policy_invalid");
    const canonical=owner.toLowerCase();if(result.has(canonical))throw Error("agent_gateway_policy_invalid");
    result.set(canonical,{model:policy.model,tools});
  }
  return result;
}
export function createAgentGatewayRoutes(mcp:Pick<McpHost,"discover"|"call">,env:NodeJS.ProcessEnv=process.env,
  dependencies:{authorizeAction?:typeof authorizeAgentAction}={}){
  const paid=createPaidRuntime(env);
  let policies:Map<string,OwnerPolicy>|undefined;
  const policy=(body:Record<string,unknown>)=>{
    if(env.AGENT_GATEWAY_ENABLED!=="true")throw Error("agent_gateway_disabled");
    if(typeof body.ownerId!=="string"||!UUID.test(body.ownerId)||
      typeof body.runId!=="string"||!UUID.test(body.runId)||
      typeof body.requestId!=="string"||!UUID.test(body.requestId))throw Error("agent_gateway_identity_invalid");
    policies??=parseAgentGatewayPolicy(env.AGENT_GATEWAY_OWNER_POLICY_JSON||"");
    const p=policies.get(body.ownerId.toLowerCase());if(!p)throw Error("agent_gateway_owner_denied");return p;
  };
  const discovered=async(ownerId:string,p:OwnerPolicy):Promise<PlannerTool[]>=>{
    const tools:PlannerTool[]=[];
    const groups=new Map<string,Binding[]>();
    for(const b of p.tools){const key=`${b.serverId}:${b.configRef}`;groups.set(key,[...(groups.get(key)||[]),b]);}
    for(const bindings of groups.values()){
      const first=bindings[0];const discovery=jsonRecord(await mcp.discover({ownerId,serverId:first.serverId,
        configRef:first.configRef,toolGrants:bindings.map(b=>b.name)}));
      if(!Array.isArray(discovery.tools))throw Error("agent_mcp_discovery_invalid");
      for(const b of bindings){
        const t=discovery.tools.map(jsonRecord).find(t=>t.name===b.name);
        if(!t||jsonRecord(t.inputSchema).type!=="object")throw Error("agent_mcp_schema_unavailable");
        const parameters={...t.inputSchema as Record<string,unknown>};
        if(b.actionIdArgument){
          const properties={...jsonRecord(parameters.properties)};
          if(jsonRecord(properties[b.actionIdArgument]).type!=="string")throw Error("agent_action_id_schema_invalid");
          delete properties[b.actionIdArgument];parameters.properties=properties;
          if(Array.isArray(parameters.required))parameters.required=parameters.required.filter(k=>k!==b.actionIdArgument);
        }
        tools.push({name:b.name,description:typeof t.description==="string"?t.description.slice(0,1024):b.name,
          parameters,validate:()=>true});
      }
    }
    return tools;
  };
  return {
    async decision(input:unknown,signal:AbortSignal){
      const b=jsonRecord(input);const p=policy(b);
      if(Object.keys(b).some(k=>!["ownerId","runId","requestId","question","observations","tools","maxTokens","maxCostMicros"].includes(k))||
        typeof b.question!=="string"||!b.question.trim()||Buffer.byteLength(b.question)>8192||
        !Array.isArray(b.observations)||b.observations.length>32||
        !Array.isArray(b.tools)||b.tools.length>32||
        !Number.isSafeInteger(b.maxTokens)||Number(b.maxTokens)<1||Number(b.maxTokens)>10000000||
        !Number.isSafeInteger(b.maxCostMicros)||Number(b.maxCostMicros)<1)
        throw Error("agent_gateway_decision_invalid");
      if(Buffer.byteLength(JSON.stringify(b.observations))>32768||b.observations.some(o=>{
        const value=jsonRecord(o);return value.origin!=="untrusted_tool_result"||typeof value.name!=="string"||
          !p.tools.some(t=>t.name===value.name);
      }))throw Error("agent_gateway_observation_invalid");
      const available=await discovered(String(b.ownerId),p);
      const selected:PlannerTool[]=[];
      for(const raw of b.tools){
        const t=jsonRecord(raw);const match=available.find(a=>a.name===t.name);
        if(!match||!isDeepStrictEqual(t.inputSchema,match.parameters)||t.description!==match.description||
          selected.some(a=>a.name===match.name))throw Error("agent_gateway_untrusted_tool_schema");
        selected.push(match);
      }
      let receipt:{tokens:number;costMicros:number}|undefined;
      const planner=createGeminiAgentPlanner({tools:selected,grants:new Set(selected.map(t=>t.name)),
        generate:r=>paid.provider().generateContent({...r,project:"omniagent",ownerId:String(b.ownerId),requestId:String(b.requestId),
          model:p.model,receiptSource:"agent",profile:p.model.includes("flash-lite")?"private-lite":"advanced-flash",trustedClass:"private",
          ownerModelAuthorized:true,maxOutputTokens:Math.min(r.maxOutputTokens,Number(b.maxTokens)),
          maxTotalTokens:Number(b.maxTokens),maxCostMicros:Number(b.maxCostMicros)}),
        onUsage:(usage,cost)=>{if(usage.totalTokens>Number(b.maxTokens))throw Error("agent_gateway_token_ceiling_exceeded");
          receipt={tokens:usage.totalTokens,costMicros:cost.costMicros};}});
      const decision=await planner({question:b.question,observations:b.observations as AgentObservation[],
        stepsRemaining:1,toolsRemaining:selected.length?1:0},signal);
      if(decision.kind==="tool"){
        const tool=selected.find(t=>t.name===decision.name)!;
        const checked=await fromJsonSchema(tool.parameters as unknown as JsonSchemaType)["~standard"].validate(decision.arguments);
        if(checked.issues)throw Error("agent_gateway_tool_arguments_invalid");
      }
      if(!receipt)throw Error("agent_gateway_usage_UNKNOWN");return {decision,usage:receipt};
    },
    async tool(input:unknown){
      const b=jsonRecord(input);const p=policy(b);
      if(Object.keys(b).some(k=>!["ownerId","runId","requestId","toolName","arguments","actionId","operation"].includes(k)))
        throw Error("agent_gateway_tool_request_invalid");
      const binding=p.tools.find(t=>t.name===b.toolName);if(!binding)throw Error("agent_gateway_tool_denied");
      const args=b.arguments;
      if(!args||typeof args!=="object"||Array.isArray(args)||Buffer.byteLength(JSON.stringify(args))>8192)
        throw Error("agent_gateway_tool_arguments_invalid");
      let name=binding.name;
      let argumentsForTool=args as Record<string,unknown>;
      if(binding.risk==="L2"){
        if(typeof b.actionId!=="string"||!UUID.test(b.actionId)||
          (b.operation!=="write"&&b.operation!=="readback"))throw Error("agent_gateway_approval_required");
        if(Object.hasOwn(argumentsForTool,binding.actionIdArgument!))throw Error("agent_gateway_action_id_spoofed");
        argumentsForTool={...argumentsForTool,[binding.actionIdArgument!]:b.actionId};
        if(b.operation==="readback")name=binding.readbackToolName!;
        const discovery=jsonRecord(await mcp.discover({ownerId:b.ownerId,serverId:binding.serverId,
          configRef:binding.configRef,toolGrants:[name]}));
        const tool=Array.isArray(discovery.tools)?discovery.tools.map(jsonRecord).find(t=>t.name===name):undefined;
        if(!tool||jsonRecord(jsonRecord(tool.inputSchema).properties)[binding.actionIdArgument!]===undefined)
          throw Error("agent_action_id_schema_invalid");
        const checked=await fromJsonSchema(tool.inputSchema as unknown as JsonSchemaType)["~standard"].validate(argumentsForTool);
        if(checked.issues)throw Error("agent_gateway_tool_arguments_invalid");
        await (dependencies.authorizeAction??authorizeAgentAction)({...b,operation:b.operation,actionId:b.actionId},env);
      }else if(b.actionId!==undefined||b.operation!==undefined)throw Error("agent_gateway_unexpected_action");
      return mcp.call({ownerId:b.ownerId,requestId:b.requestId,serverId:binding.serverId,
        configRef:binding.configRef,toolName:name,toolGrants:[name],arguments:argumentsForTool});
    },
    close:paid.close
  };
}

function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(k=>
    `${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function authorizeAgentAction(input:Record<string,unknown>,env:NodeJS.ProcessEnv,
  fetcher:typeof fetch=fetch):Promise<void>{
  const target=new URL(env.AGENT_ACTION_CHAT_URL||"");const audience=env.AGENT_ACTION_CHAT_AUDIENCE;
  if(target.protocol!=="https:"||target.pathname!=="/"||target.username||target.password||target.search||
    target.hash||typeof audience!=="string"||!serviceTargetMatches(target.toString(),audience))throw Error("agent_action_authorizer_unavailable");
  const client=await new GoogleAuth().getIdTokenClient(audience);
  const token=await client.idTokenProvider.fetchIdToken(audience);
  const {ownerId,runId,actionId,toolName,arguments:args,operation}=input;
  const paramsDigest=createHash("sha256").update(canonical({runId,tool:toolName,input:args})).digest("hex");
  const response=await fetcher(new URL("/internal/v1/chat/agent-actions:authorize",target),{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token}`,"content-type":"application/json"},
    body:JSON.stringify({ownerId,runId,actionId,toolName,arguments:args,paramsDigest,operation})});
  if(!response.ok)throw Error("agent_gateway_approval_required");
  const raw=await response.text();
  if(Buffer.byteLength(raw)>2048||jsonRecord(JSON.parse(raw)).authorized!==true)throw Error("agent_gateway_approval_required");
}
