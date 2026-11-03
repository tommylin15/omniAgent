import {createHmac,randomUUID} from "node:crypto";
import {OAuth2Client,GoogleAuth} from "google-auth-library";
import pg from "pg";
import {PgAgentRunStore,type AgentDb} from "../chat-api/agent_runs.js";
import {chatDatabaseUrl,chatDatabaseTrustAnchor,chatDatabasePoolConfig} from "../chat-api/database.js";
import {createAgentWorker} from "./server.js";
import type {AgentGateway,RuntimeTool} from "./runtime.js";

export function fixedServiceOrigin(raw:string):URL{
 const u=new URL(raw);
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.pathname!=="/")
  throw new Error("invalid_agent_service_origin");
 return u;
}
export async function startAgentWorker(env:NodeJS.ProcessEnv=process.env){
 const enabled=env.AGENT_RUNTIME_ENABLED==="true";
 const verify=new OAuth2Client(),google=new GoogleAuth();
 const audience=env.AGENT_WORKER_AUDIENCE??"";
 const callers=(env.AGENT_WORKER_CALLER_EMAILS??"").split(",").map(x=>x.trim()).filter(Boolean);
 let store:PgAgentRunStore|undefined,gateway:AgentGateway|undefined,tools:RuntimeTool[]=[];
 let pool:pg.Pool|undefined;
 if(enabled){
  if(!chatDatabaseUrl(env)||!audience||!callers.length||!env.AGENT_GATEWAY_URL||
   !env.AGENT_GATEWAY_AUDIENCE||!env.AGENT_GATEWAY_SIGNING_KEY||env.AGENT_GATEWAY_SIGNING_KEY.length<32)
   throw new Error("agent_runtime_configuration_unavailable");
  fixedServiceOrigin(audience);
  const target=fixedServiceOrigin(env.AGENT_GATEWAY_URL),gatewayAudience=fixedServiceOrigin(env.AGENT_GATEWAY_AUDIENCE).origin;
  const key=env.AGENT_GATEWAY_SIGNING_KEY;
  if(env.CHAT_DATABASE_TLS_MODE!=="verified-ca")throw new Error("agent_worker_verified_database_tls_required");
  pool=new pg.Pool({...chatDatabasePoolConfig(chatDatabaseUrl(env),"verified-ca",
   chatDatabaseTrustAnchor(env),env.CHAT_DATABASE_TLS_SERVERNAME),max:4,query_timeout:10000});
  store=new PgAgentRunStore(pool as unknown as AgentDb);
  const post=async(path:string,payload:unknown,signal:AbortSignal):Promise<unknown>=>{
   const client=await google.getIdTokenClient(gatewayAudience);
   const token=await client.idTokenProvider.fetchIdToken(gatewayAudience);
   const body=JSON.stringify(payload),timestamp=String(Date.now());
   if(Buffer.byteLength(body)>1048576)throw new Error("agent_gateway_payload_oversize");
   const signature=createHmac("sha256",key).update(timestamp).update(".").update(body).digest("hex");
   const response=await fetch(new URL(path,target),{method:"POST",signal,redirect:"error",
    headers:{authorization:`Bearer ${token}`,"content-type":"application/json",
     "X-OmniAgent-Timestamp":timestamp,"X-OmniAgent-Signature":`v1=${signature}`},body});
   if(!response.ok)throw new Error("agent_gateway_unavailable");
   let text="";
   if(!response.body)throw new Error("agent_gateway_empty");
   const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;
   try{for(;;){const chunk=await reader.read();if(chunk.done)break;
    bytes+=chunk.value.byteLength;if(bytes>1048576)throw new Error("agent_gateway_response_oversize");
    text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
   }finally{await reader.cancel();}
   return JSON.parse(text);
  };
  gateway=async(request,signal)=>await post("/internal/v1/agent/decision",{
   ...request,requestId:randomUUID()},signal) as Awaited<ReturnType<AgentGateway>>;
  const configured:unknown=JSON.parse(env.AGENT_WORKER_TOOLS??"[]");
  if(!Array.isArray(configured)||configured.length>128)throw new Error("invalid_worker_tools");
  tools=configured.map((raw:unknown):RuntimeTool=>{
   if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("invalid_worker_tool");
   const t=raw as Record<string,unknown>;
   if(typeof t.name!=="string"||!/^[a-z][a-z0-9_.-]{1,127}$/.test(t.name)||
    typeof t.description!=="string"||typeof t.grant!=="string"||!t.inputSchema||
    typeof t.inputSchema!=="object"||Array.isArray(t.inputSchema)||!["L0","L1","L2"].includes(String(t.risk)))
    throw new Error("invalid_or_unbound_worker_tool");
   const tool:RuntimeTool={name:t.name,description:t.description,inputSchema:t.inputSchema as Record<string,unknown>,
    grant:t.grant,risk:t.risk as RuntimeTool["risk"],call:async(input,context,signal)=>
     post("/internal/v1/agent/tool",{...context,toolName:t.name,arguments:input,requestId:randomUUID()},signal)};
   if(t.risk==="L2"){
    if(typeof t.confirmationField!=="string"||!/^[a-zA-Z][a-zA-Z0-9_.]{0,127}$/.test(t.confirmationField))
     throw new Error("agent_l2_readback_binding_unavailable");
    const field=t.confirmationField;
    tool.call=async(input,context,signal)=>post("/internal/v1/agent/tool",{
     ...context,toolName:t.name,arguments:input,requestId:randomUUID(),operation:"write"},signal);
    tool.readback=async(input,context,signal)=>post("/internal/v1/agent/tool",{
     ...context,toolName:t.name,arguments:input,requestId:randomUUID(),operation:"readback"},signal);
    const extract=(value:unknown)=>field.split(".").reduce<unknown>((v,k)=>
     v&&typeof v==="object"?(v as Record<string,unknown>)[k]:undefined,value);
    tool.confirms=(written,readback)=>{
     const a=extract(written),b=extract(readback);
     return (typeof a==="string"&&a.length>0||typeof a==="number"&&Number.isFinite(a))&&a===b;
    };
   }
   return tool;
  });
 }
 const server=createAgentWorker({enabled,
  store:store??new PgAgentRunStore({query:async()=>{throw new Error("agent_store_unavailable");}}),
  gateway:gateway??(async()=>{throw new Error("agent_gateway_unavailable");}),tools:async()=>tools,
  authenticate:async request=>{
   const token=request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
   if(!token||!audience)return false;
   try{const ticket=await verify.verifyIdToken({idToken:token,audience});const p=ticket.getPayload();
    return !!p&&p.email_verified===true&&!!p.email&&callers.includes(p.email);
   }catch{return false;}
  },ready:async()=>{
   if(!store||!gateway)return false;
   try{const rows=(await store.db.query(`SELECT bool_and(has_table_privilege(current_user,t,p)) AND
    has_sequence_privilege(current_user,pg_get_serial_sequence('omni_chat.agent_steps','sequence'),'USAGE') AS ready
    FROM (VALUES ('omni_chat.agent_runs','SELECT'),('omni_chat.agent_runs','INSERT'),('omni_chat.agent_runs','UPDATE'),
     ('omni_chat.agent_steps','SELECT'),('omni_chat.agent_steps','INSERT'),
     ('omni_chat.agent_tool_receipts','SELECT'),('omni_chat.agent_tool_receipts','INSERT'),('omni_chat.agent_tool_receipts','UPDATE'),
     ('omni_chat.agent_reconciliations','INSERT'),('omni_chat.events','SELECT'),('omni_chat.events','INSERT'),
     ('omni_chat.turns','SELECT'),('omni_chat.turns','UPDATE'),('omni_chat.threads','SELECT'),('omni_chat.threads','UPDATE')) AS permissions(t,p)`)).rows;
    return rows[0]?.ready===true;}
   catch{return false;}
  }});
 const port=Number(env.PORT??8080);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error("invalid_worker_port");
 server.listen(port,"0.0.0.0");
 const close=()=>{server.close();void pool?.end();};
 process.once("SIGTERM",close);process.once("SIGINT",close);
 return server;
}
if(process.argv[1]?.replaceAll("\\","/").endsWith("/agent-worker/main.js")){
 void startAgentWorker().catch(()=>{console.error("agent_worker_startup_unavailable");process.exitCode=1;});
}
