import type {IncomingMessage,ServerResponse} from "node:http";
import {createHash} from "node:crypto";
import type {ChatStore} from "./storage.js";
import {ChatConflict,ChatNotFound} from "./storage.js";
import type {PgAgentRunStore,AgentPolicy} from "./agent_runs.js";
import type {ArtifactService} from "./artifacts.js";
import {MAX_ARTIFACT_BYTES} from "./artifacts.js";
import type {BackgroundJobs} from "./background_jobs.js";
import type {ArchiveService,BoundedAnalytics} from "./archive.js";
import type {ChatMcp} from "./mcp_dispatch.js";
import type {MessageIntentStore} from "./message_intents.js";

export type ProductServices={
  agent?:{runs:PgAgentRunStore;policyFor:(owner:string)=>AgentPolicy|undefined;
    execute:(owner:string,runId:string)=>Promise<unknown>};
  artifacts?:ArtifactService;jobs?:BackgroundJobs;workflowKeys?:ReadonlySet<string>;
  archive?:ArchiveService;analytics?:BoundedAnalytics;mcp?:ChatMcp;
  status?:()=>Promise<Record<string,unknown>>;
  intents?:MessageIntentStore;
  jobsOwnerAllowed?:(owner:string)=>boolean;
  analyticsOwnerAllowed?:(owner:string)=>boolean;
};
function send(response:ServerResponse,status:number,value:unknown){
  response.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
  response.end(JSON.stringify(value));
}
async function bytes(request:IncomingMessage,max:number):Promise<Buffer>{
  const parts:Buffer[]=[];let size=0;
  for await(const chunk of request){const part=Buffer.from(chunk);size+=part.length;
    if(size>max)throw new SyntaxError("request too large");parts.push(part);}
  return Buffer.concat(parts);
}
async function json(request:IncomingMessage):Promise<Record<string,unknown>>{
  const value:unknown=JSON.parse((await bytes(request,65536)).toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))throw new SyntaxError("object required");
  return value as Record<string,unknown>;
}
function fields(value:Record<string,unknown>,names:string[]){
  if(Object.keys(value).some(key=>!names.includes(key)))throw new SyntaxError("unexpected fields");
}
function text(value:unknown):string{
  if(typeof value!=="string"||!value.trim()||value.length>8192)throw new SyntaxError("invalid text");return value;
}
function idempotency(request:IncomingMessage):string{
  const value=request.headers["idempotency-key"];
  if(typeof value!=="string"||!/^[A-Za-z0-9._:-]{1,128}$/.test(value))throw new SyntaxError("idempotency key required");
  return value;
}
const UUID="([a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})";

// Called only after Google OAuth and DB Owner resolution in server.ts.
export async function productRoute(request:IncomingMessage,response:ServerResponse,url:URL,
  ownerId:string,store:ChatStore,services:ProductServices):Promise<boolean>{
  const reply=(status:number,value:unknown)=>{send(response,status,value);return true;};
  const jobs=services.jobs&&(services.jobsOwnerAllowed?.(ownerId)??true)?services.jobs:undefined;
  const analytics=services.analytics&&(services.analyticsOwnerAllowed?.(ownerId)??true)?services.analytics:undefined;
  const intentKey=/^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/message-intents\/([a-fA-F0-9-]{36})$/.exec(url.pathname);
  if(intentKey&&request.method==="GET"){
    if(!services.intents)return reply(404,{error:"not_found"});
    return reply(200,{intent:await services.intents.read(ownerId,intentKey[1],intentKey[2])});
  }
  const intent=/^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/message-intents(?:\/([a-fA-F0-9-]{36})\/cancel)?$/.exec(url.pathname);
  if(intent){
    if(!services.intents)return reply(404,{error:"not_found"});
    if(request.method==="GET"&&!intent[2])return reply(200,{intent:await services.intents.active(ownerId,intent[1])});
    if(request.method==="POST"&&intent[2])return reply(200,await services.intents.cancel(ownerId,intent[1],intent[2]));
    if(request.method==="POST"){
      const value=await json(request);fields(value,["content"]);
      if(typeof value.content!=="string")throw new SyntaxError("invalid content");
      return reply(201,await services.intents.prepare(ownerId,intent[1],idempotency(request),value.content));
    }
    return reply(404,{error:"not_found"});
  }
  if(request.method==="GET"&&url.pathname==="/v1/capabilities")return reply(200,{
    agentEnabled:Boolean(services.agent?.policyFor(ownerId)),artifactsEnabled:Boolean(services.artifacts),
    jobsEnabled:Boolean(jobs),archiveEnabled:Boolean(services.archive),analyticsEnabled:Boolean(analytics),
    mcpEnabled:Boolean(services.mcp),workflowKeys:jobs?[...services.workflowKeys??[]]:[]});
  const create=/^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/agent-runs$/.exec(url.pathname);
  if(create&&request.method==="GET"){
    if(!services.agent?.policyFor(ownerId))return reply(404,{error:"not_found"});
    await store.thread(ownerId,create[1]);
    return reply(200,{items:await services.agent.runs.list(ownerId,create[1])});
  }
  if(create&&request.method==="POST"){
    const agent=services.agent,policy=agent?.policyFor(ownerId);
    if(!agent||!policy)return reply(404,{error:"not_found"});
    const value=await json(request);fields(value,["content"]);
    const content=text(value.content);
    if(Buffer.byteLength(content)>8192)throw new SyntaxError("agent content exceeds limit");
    const message=await store.message(ownerId,create[1],content,idempotency(request),"agent");
    const turn=message.turn as Record<string,unknown>;
    return reply(201,await agent.runs.create(ownerId,create[1],String(turn.turn_id),content,policy));
  }
  const agentPath=new RegExp(`^/v1/agent-runs/${UUID}(?:/(execute|cancel|resume|approvals))?$`).exec(url.pathname);
  if(agentPath){
    const agent=services.agent;
    if(!agent||!agent.policyFor(ownerId))return reply(404,{error:"not_found"});
    const run=await agent.runs.get(ownerId,agentPath[1]);if(!run)throw new ChatNotFound("run not found");
    if(request.method==="GET"&&!agentPath[2])return reply(200,{...run,
      approvals:await agent.runs.approvals(ownerId,agentPath[1]),
      progress:await agent.runs.events(ownerId,agentPath[1],Number(url.searchParams.get("after")??0))});
    if(request.method==="POST"){
      if(agentPath[2]==="execute")return reply(200,await agent.execute(ownerId,agentPath[1]));
      if(agentPath[2]==="cancel")return reply(200,await agent.runs.cancel(ownerId,agentPath[1]));
      if(agentPath[2]==="resume"){
        const resumed=await agent.runs.resume(ownerId,agentPath[1]);
        if(!resumed)throw new ChatConflict("run requires reconciliation");return reply(200,resumed);
      }
      if(agentPath[2]==="approvals"){
        const value=await json(request);fields(value,["actionId","digest","expiresAt"]);
        await agent.runs.approve(ownerId,agentPath[1],text(value.actionId),text(value.digest),text(value.expiresAt));
        return reply(200,{status:"approved"});
      }
    }
    return reply(404,{error:"not_found"});
  }
  if(url.pathname==="/v1/artifacts"&&request.method==="POST"){
    if(!services.artifacts)return reply(404,{error:"not_found"});
    const value=await json(request);fields(value,["sha256","byteLength","contentType"]);
    return reply(201,await services.artifacts.reserve(ownerId,{idempotencyKey:idempotency(request),
      sha256:text(value.sha256),byteLength:value.byteLength as number,contentType:text(value.contentType)}));
  }
  if(url.pathname==="/v1/artifacts"&&request.method==="GET"){
    if(!services.artifacts)return reply(404,{error:"not_found"});return reply(200,{items:await services.artifacts.list(ownerId)});
  }
  if(url.pathname==="/v1/artifacts/text"&&request.method==="POST"){
    if(!services.artifacts)return reply(404,{error:"not_found"});
    const value=await json(request);fields(value,["text"]);
    const content=Buffer.from(text(value.text),"utf8");
    const artifact=await services.artifacts.reserve(ownerId,{idempotencyKey:idempotency(request),
      sha256:createHash("sha256").update(content).digest("hex"),byteLength:content.length,contentType:"text/plain"});
    const access=await services.artifacts.signedAccess(ownerId,String(artifact.id),"upload");
    return reply(201,{...artifact,...await services.artifacts.upload(ownerId,String(artifact.id),access.token,content)});
  }
  const artifactText=new RegExp(`^/v1/artifacts/${UUID}/text$`).exec(url.pathname);
  if(artifactText&&request.method==="GET"){
    if(!services.artifacts)return reply(404,{error:"not_found"});
    const artifact=await services.artifacts.readVerified(ownerId,artifactText[1]);
    if(!artifact.contentType.startsWith("text/"))throw new SyntaxError("artifact is not text");
    return reply(200,{text:artifact.bytes.toString("utf8"),sha256:artifact.sha256});
  }
  const artifact=new RegExp(`^/v1/artifacts/${UUID}/(access|upload|download|reconcile|archive)$`).exec(url.pathname);
  if(artifact){
    if(!services.artifacts)return reply(404,{error:"not_found"});
    const [,artifactId,operation]=artifact;
    if(operation==="access"&&request.method==="POST"){
      const value=await json(request);fields(value,["operation"]);
      if(value.operation!=="upload"&&value.operation!=="download")throw new SyntaxError("invalid access");
      return reply(200,await services.artifacts.signedAccess(ownerId,artifactId,value.operation));
    }
    if(operation==="reconcile"&&request.method==="POST")return reply(200,await services.artifacts.reconcile(ownerId,artifactId));
    if(operation==="archive"&&request.method==="POST"){
      if(!services.archive)return reply(404,{error:"not_found"});
      return reply(200,await services.archive.archive(ownerId,artifactId,idempotency(request)));
    }
    // Access tokens stay in a header, out of URLs, browser history and access logs.
    const access=request.headers["x-omniagent-artifact-access"];
    if(typeof access!=="string")throw new ChatNotFound("artifact access denied");
    if(operation==="upload"&&request.method==="PUT")return reply(200,await services.artifacts.upload(ownerId,artifactId,access,await bytes(request,MAX_ARTIFACT_BYTES)));
    if(operation==="download"&&request.method==="GET"){
      const result=await services.artifacts.download(ownerId,artifactId,access);
      response.writeHead(200,{"Content-Type":"application/octet-stream","Content-Length":result.bytes.length,
        "Content-Disposition":"attachment","X-Content-Type-Options":"nosniff","Cache-Control":"no-store",
        "X-OmniAgent-Content-SHA256":result.sha256});response.end(result.bytes);return true;
    }
    return reply(404,{error:"not_found"});
  }
  if(url.pathname==="/v1/jobs"&&request.method==="POST"){
    if(!jobs)return reply(404,{error:"not_found"});
    const value=await json(request);fields(value,["workflowKey"]);const key=text(value.workflowKey);
    if(!services.workflowKeys?.has(key))throw new ChatNotFound("workflow not found");
    return reply(201,await jobs.enqueue(ownerId,"workflow",idempotency(request),{workflowKey:key}));
  }
  if(url.pathname==="/v1/jobs"&&request.method==="GET"){
    if(!jobs)return reply(404,{error:"not_found"});return reply(200,{items:await jobs.list(ownerId)});
  }
  const job=new RegExp(`^/v1/jobs/${UUID}(?:/(cancel|acknowledge))?$`).exec(url.pathname);
  if(job){
    if(!jobs)return reply(404,{error:"not_found"});
    if(request.method==="GET"&&!job[2])return reply(200,await jobs.get(ownerId,job[1]));
    if(request.method==="POST"&&job[2]==="cancel"){await jobs.cancel(ownerId,job[1]);return reply(200,{status:"cancel_requested"});}
    if(request.method==="POST"&&job[2]==="acknowledge"){await jobs.acknowledge(ownerId,job[1]);return reply(200,{status:"acknowledged"});}
  }
  if(url.pathname==="/v1/notifications"&&request.method==="GET"){
    if(!jobs)return reply(404,{error:"not_found"});return reply(200,{items:await jobs.notifications(ownerId)});
  }
  if(url.pathname==="/v1/schedules"&&request.method==="POST"){
    if(!jobs)return reply(404,{error:"not_found"});
    const value=await json(request);fields(value,["workflowKey","intervalSeconds","nextRunAt"]);const key=text(value.workflowKey);
    if(!services.workflowKeys?.has(key))throw new ChatNotFound("workflow not found");
    return reply(201,await jobs.schedule(ownerId,"workflow",{workflowKey:key},value.intervalSeconds as number,text(value.nextRunAt),idempotency(request)));
  }
  if(url.pathname==="/v1/schedules"&&request.method==="GET"){
    if(!jobs)return reply(404,{error:"not_found"});return reply(200,{items:await jobs.schedules(ownerId)});
  }
  const schedule=new RegExp(`^/v1/schedules/${UUID}$`).exec(url.pathname);
  if(schedule&&request.method==="PUT"){
    if(!jobs)return reply(404,{error:"not_found"});
    const value=await json(request);fields(value,["enabled"]);
    await jobs.setScheduleEnabled(ownerId,schedule[1],value.enabled as boolean);return reply(200,{status:"updated"});
  }
  if(url.pathname==="/v1/analytics/queries"&&request.method==="POST"){
    if(!analytics)return reply(404,{error:"not_found"});
    const value=await json(request);fields(value,["since","limit"]);
    return reply(202,await analytics.query(ownerId,text(value.since),value.limit as number|undefined,idempotency(request)));
  }
  const query=new RegExp(`^/v1/analytics/queries/${UUID}$`).exec(url.pathname);
  if(query&&request.method==="GET"){
    if(!analytics)return reply(404,{error:"not_found"});return reply(200,await analytics.readback(ownerId,query[1]));
  }
  const mcp=/^\/v1\/mcp\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/(discover|call|cancel|disconnect)$/.exec(url.pathname);
  if(mcp&&request.method==="POST"){
    if(!services.mcp)return reply(404,{error:"not_found"});
    return reply(200,await services.mcp.execute(ownerId,mcp[1],mcp[2] as "discover"|"call"|"cancel"|"disconnect",await json(request)));
  }
  return false;
}
