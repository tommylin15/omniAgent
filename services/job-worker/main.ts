import { createHmac } from "node:crypto";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { Pool } from "pg";
import { chatDatabasePoolConfig,chatDatabaseTrustAnchor,chatDatabaseUrl } from "../chat-api/database.js";
import { ArtifactService,GcsArtifactObjects,parseArtifactLimits } from "../chat-api/artifacts.js";
import { ArchiveService,BoundedAnalytics } from "../chat-api/archive.js";
import { BackgroundJobs,type JobHandler } from "../chat-api/background_jobs.js";
import { WorkflowRunner } from "../chat-api/workflows.js";
import { ChatMcp } from "../chat-api/mcp_dispatch.js";
import { makeArchiveWriterClient,approvedServiceOrigin } from "./archive_writer.js";
import { parseJobWorkerConfig,parseObject } from "./config.js";
import { makeJobWorkerServer } from "./server.js";
import {serviceTargetMatches} from "../agent-gateway/service_target.js";

const config=parseJobWorkerConfig(process.env);
const google=new OAuth2Client(),auth=new GoogleAuth();
let pool:Pool|undefined,jobs:BackgroundJobs|undefined;
if(config.enabled) {
  if(process.env.CHAT_DATABASE_TLS_MODE!=="verified-ca") throw new Error("worker requires verified PostgreSQL TLS");
  const dsn=chatDatabaseUrl(process.env);if(!dsn) throw new Error("worker database unavailable");
  pool=new Pool(chatDatabasePoolConfig(dsn,"verified-ca",chatDatabaseTrustAnchor(process.env),process.env.CHAT_DATABASE_TLS_SERVERNAME));
  const handlers:Record<string,JobHandler>={};
  const bundle=process.env.OMNIAGENT_BUNDLE?parseObject(process.env.OMNIAGENT_BUNDLE):{};
  if(Object.keys(config.workflows).length) {
    const target=approvedServiceOrigin(process.env.CHAT_GATEWAY_URL??"");
    const audience=process.env.CHAT_GATEWAY_AUDIENCE;
    const key=bundle.mcp_owner_signing_key;
    if(typeof audience!=="string"||!serviceTargetMatches(target,audience)||typeof key!=="string"||key.length<32) throw new Error("bounded authenticated MCP gateway configuration required");
    const mcp=new ChatMcp(process.env.AGENT_JOBS_MCP_POLICY_JSON??"",async(operation,value)=>{
      if(operation!=="mcp/call") throw new Error("worker supports only configured MCP call operations");
      const timestamp=String(Date.now()),body=JSON.stringify(value);
      const token=await (await auth.getIdTokenClient(audience)).idTokenProvider.fetchIdToken(audience);
      const response=await fetch(target+"/internal/v1/mcp/call",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",
        "X-OmniAgent-Timestamp":timestamp,"X-OmniAgent-Signature":"v1="+createHmac("sha256",key).update(timestamp+"."+body).digest("hex")},body,
        signal:AbortSignal.timeout(90_000),redirect:"error"});
      if(!response.ok||!response.body) throw new Error("workflow MCP request unavailable");
      const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
      try {for(;;) {const {done,value}=await reader.read();if(done) break;size+=value.length;if(size>65_536) throw new Error("MCP result exceeds workflow bound");chunks.push(value);}}
      finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    });
    const runner=new WorkflowRunner(pool,config.workflows,mcp.execute.bind(mcp));handlers.workflow=runner.handler();
  }
  if(config.archive) {
    if(process.env.ARTIFACT_STORAGE_ENABLED!=="true") throw new Error("archive requires enabled artifact storage");
    const signingKey=process.env.ARTIFACT_SIGNING_SECRET??bundle.artifact_signing_key;
    if(typeof signingKey!=="string") throw new Error("artifact signing secret unavailable");
    const artifacts=new ArtifactService(pool,new GcsArtifactObjects(process.env.ARTIFACT_GCS_BUCKET??""),signingKey,parseArtifactLimits(process.env.ARTIFACT_LIMITS_JSON??""));
    const archive=new ArchiveService(pool,artifacts,{table:config.archive.table,writer:makeArchiveWriterClient(config.archive,auth)});
    handlers.archive=async(payload,context)=>{
      if(Object.keys(payload).some(key=>key!=="artifactId")||typeof payload.artifactId!=="string") throw new SyntaxError("invalid archive job payload");
      return archive.archive(context.ownerId,payload.artifactId,context.idempotencyKey,context.signal);
    };
  }
  if(config.analytics) {
    const analytics=new BoundedAnalytics(pool,config.analytics,auth);
    handlers.analytics=async(payload,context)=>{
      if(Object.keys(payload).some(key=>!["since","limit"].includes(key))||typeof payload.since!=="string") throw new SyntaxError("invalid analytics job payload");
      if(payload.limit!==undefined&&typeof payload.limit!=="number") throw new SyntaxError("invalid analytics row limit");
      const queued=await analytics.query(context.ownerId,payload.since,payload.limit===undefined?100:payload.limit as number,context.idempotencyKey);
      if(queued.state==="uncertain") return {...queued,requiresReconciliation:true};
      const started=Date.now();
      while(Date.now()-started<60_000) {
        await context.checkpoint();context.signal.throwIfAborted();
        const result=await analytics.readback(context.ownerId,queued.id);
        if(result.complete===true) return {...result,state:"completed"};
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
      return {id:queued.id,state:"running",requiresReconciliation:true};
    };
  }
  jobs=new BackgroundJobs(pool,handlers,config.owners,config.queueLimits);
}
const server=makeJobWorkerServer({enabled:config.enabled,jobs,workerId:process.env.K_REVISION??"manual-worker",
  verify:async token=>{
    if(!config.enabled||!config.audience) throw new Error("worker disabled");
    const claims=(await google.verifyIdToken({idToken:token,audience:config.audience})).getPayload();
    if(!claims?.sub||!["https://accounts.google.com","accounts.google.com"].includes(claims.iss)||claims.email_verified!==true||
      typeof claims.email!=="string"||!config.callers.includes(claims.email.toLowerCase())) throw new Error("unauthorized worker caller");
  },metrics:async()=>({jobs:(await pool!.query(`SELECT kind,state,count(*)::text AS count,
    max(updated_at) AS latest_change,sum(duration_ms)::text AS total_duration_ms,avg(duration_ms)::text AS average_duration_ms
    FROM omni_chat.background_jobs WHERE owner_id=ANY($1::uuid[]) GROUP BY kind,state`,[config.owners])).rows,
    analytics:{enabled:Boolean(config.analytics),maximumBytesBilledPerQuery:config.analytics?.maximumBytesBilled??null,
      maxOwnerDailyQueries:config.analytics?.maxOwnerDailyQueries??null,maxGlobalDailyQueries:config.analytics?.maxGlobalDailyQueries??null,actualCost:null},
    archive:{enabled:Boolean(config.archive)},costNote:"Actual provider billing is unavailable here; limits are approved ceilings, not spend."})});
server.requestTimeout=300_000;server.headersTimeout=10_000;
server.listen(Number(process.env.PORT??8080),"0.0.0.0");
process.once("SIGTERM",()=>server.close(()=>{void pool?.end();}));
