import {createHmac} from "node:crypto";
import {GoogleAuth} from "google-auth-library";
import type {Pool} from "pg";
import {PgAgentRunStore,validateAgentPolicy,type AgentPolicy} from "./agent_runs.js";
import {ArtifactService,GcsArtifactObjects,parseArtifactLimits} from "./artifacts.js";
import {ArchiveService,BoundedAnalytics,type AnalyticsConfig} from "./archive.js";
import {BackgroundJobs,parseJobQueueLimits} from "./background_jobs.js";
import {WorkflowRunner,type WorkflowConfig} from "./workflows.js";
import {ChatMcp} from "./mcp_dispatch.js";
import type {ProductServices} from "./product_routes.js";
import {makeArchiveWriter} from "./archive_writer.js";
import {MessageIntentStore} from "./message_intents.js";
import {serviceTargetMatches} from "../agent-gateway/service_target.js";

function object(raw:string):Record<string,unknown>{
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("invalid product configuration");
  return value as Record<string,unknown>;
}
function origin(raw:string):URL{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")
    throw Error("invalid private service target");return url;
}
function policies(raw:string):Map<string,AgentPolicy>{
  const entries=Object.entries(object(raw));if(entries.length>100)throw Error("agent policies oversized");
  const result=new Map<string,AgentPolicy>();
  for(const [owner,value]of entries){
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(owner)||result.has(owner.toLowerCase()))
      throw Error("invalid agent owner policy");
    validateAgentPolicy(value as AgentPolicy);result.set(owner.toLowerCase(),structuredClone(value as AgentPolicy));
  }
  return result;
}
export function productServices(pool:Pool,env:NodeJS.ProcessEnv=process.env):ProductServices{
  const result:ProductServices={},auth=new GoogleAuth();
  if(env.CHAT_DURABLE_INTENTS_ENABLED==="true")result.intents=new MessageIntentStore(pool);
  let bundle:Record<string,unknown>={};
  if(env.OMNIAGENT_BUNDLE)bundle=object(env.OMNIAGENT_BUNDLE);
  const post=async(target:URL,audience:string,path:string,payload:unknown,signingKey?:string)=>{
    if(!serviceTargetMatches(target.toString(),audience))throw Error("private service audience mismatch");
    const client=await auth.getIdTokenClient(audience),token=await client.idTokenProvider.fetchIdToken(audience);
    const body=JSON.stringify(payload),timestamp=String(Date.now());
    const signature=signingKey?createHmac("sha256",signingKey).update(timestamp).update(".").update(body).digest("hex"):undefined;
    const response=await fetch(new URL(path,target),{method:"POST",redirect:"error",signal:AbortSignal.timeout(110000),
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",
        ...(signature?{"X-OmniAgent-Timestamp":timestamp,"X-OmniAgent-Signature":`v1=${signature}`}:{})},body});
    if(!response.ok)throw Error("private service unavailable; read back durable state before retry");
    const reader=response.body?.getReader();if(!reader)throw Error("empty service response");
    const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;
      if(size>1048576)throw Error("service response oversized");chunks.push(chunk.value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  };
  if(env.AGENT_RUNTIME_ENABLED==="true"){
    if(env.CHAT_DATABASE_TLS_MODE!=="verified-ca")throw Error("agent runtime requires verified database TLS");
    const approved=policies(env.AGENT_OWNER_POLICIES_JSON??""),target=origin(env.AGENT_WORKER_URL??"");
    const audience=origin(env.AGENT_WORKER_AUDIENCE??"").origin;
    result.agent={runs:new PgAgentRunStore(pool),policyFor:owner=>approved.get(owner.toLowerCase()),
      execute:(ownerId,runId)=>post(target,audience,"/internal/agent-runs/execute",{ownerId,runId})};
  }
  if(env.ARTIFACT_STORAGE_ENABLED==="true"){
    const key=env.ARTIFACT_SIGNING_SECRET??bundle.artifact_signing_key;
    if(typeof key!=="string"||!env.ARTIFACT_GCS_BUCKET)throw Error("artifact storage configuration missing");
    result.artifacts=new ArtifactService(pool,new GcsArtifactObjects(env.ARTIFACT_GCS_BUCKET),key,
      parseArtifactLimits(env.ARTIFACT_LIMITS_JSON??""));
  }
  if(env.ARCHIVE_ENABLED==="true"){
    if(!result.artifacts)throw Error("archive requires verified artifact storage");
    const config=object(env.AGENT_JOBS_ARCHIVE_CONFIG_JSON??"");
    result.archive=new ArchiveService(pool,result.artifacts,{table:String(config.table),writer:makeArchiveWriter(config)});
  }
  if(env.ANALYTICS_ENABLED==="true"){
    const owners=(env.ANALYTICS_APPROVED_OWNER_IDS??"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(!owners.length||owners.some(x=>!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x)))
      throw Error("analytics owner grants missing");
    result.analytics=new BoundedAnalytics(pool,object(env.AGENT_JOBS_ANALYTICS_CONFIG_JSON??"") as AnalyticsConfig);
    result.analyticsOwnerAllowed=owner=>owners.includes(owner.toLowerCase());
  }
  if(env.CHAT_MCP_ENABLED==="true"||env.AGENT_JOBS_ENABLED==="true"){
    const signingKey=bundle.mcp_owner_signing_key;
    if(typeof signingKey!=="string"||signingKey.length<32)throw Error("MCP signing configuration missing");
    const target=origin(env.CHAT_GATEWAY_URL??""),audience=origin(env.CHAT_GATEWAY_AUDIENCE??"").origin;
    result.mcp=new ChatMcp(env.AGENT_JOBS_MCP_POLICY_JSON??env.CHAT_MCP_POLICY_JSON??"",
      async(operation,payload)=>post(target,audience,"/internal/v1/"+operation,payload,signingKey));
  }
  if(env.AGENT_JOBS_ENABLED==="true"){
    if(!result.mcp)throw Error("job MCP configuration unavailable");
    const config=object(env.AGENT_JOBS_WORKFLOWS_JSON??"") as Record<string,WorkflowConfig>;
    const owners=(env.AGENT_JOBS_APPROVED_OWNER_IDS??"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(!owners.length||owners.some(x=>!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x)))
      throw Error("job owners not configured");
    const runner=new WorkflowRunner(pool,config,result.mcp.execute.bind(result.mcp));
    result.jobs=new BackgroundJobs(pool,{workflow:runner.handler()},owners,
      parseJobQueueLimits(env.JOB_QUEUE_LIMITS_JSON??""));result.workflowKeys=new Set(Object.keys(config));
    result.jobsOwnerAllowed=owner=>owners.includes(owner.toLowerCase());
  }
  result.status=async()=>{
    const database:Record<string,string>={};
    const checks={admin:"SELECT version FROM omni_chat.agent_admin_settings LIMIT 0",
      agent:"SELECT checkpoint FROM omni_chat.agent_runs LIMIT 0",artifacts:"SELECT id FROM omni_chat.artifacts LIMIT 0",
      jobs:"SELECT id FROM omni_chat.background_jobs LIMIT 0"};
    for(const [key,sql]of Object.entries(checks)){
      try{await pool.query(sql);database[key]="readable";}catch{database[key]="unavailable";}
    }
    return {database,configured:{agent:Boolean(result.agent),artifacts:Boolean(result.artifacts),
      jobs:Boolean(result.jobs),archive:Boolean(result.archive),analytics:Boolean(result.analytics),mcp:Boolean(result.mcp)},
      secrets:{legacyGemini:typeof bundle.gemini_api_key==="string"&&bundle.gemini_api_key.length>0,
        paidGemini:typeof bundle.gemini_paid_api_key==="string"&&bundle.gemini_paid_api_key.length>0},
      runtimeVerification:"not_verified",billingVerification:"not_verified"};
  };
  return result;
}
