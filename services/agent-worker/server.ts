import {createServer,type IncomingMessage} from "node:http";
import {executeAgentRun,type RuntimeDependencies} from "./runtime.js";

export function createAgentWorker(deps:RuntimeDependencies&{
 enabled:boolean;authenticate:(request:IncomingMessage)=>Promise<boolean>;
 ready:()=>Promise<boolean>;
}){
 return createServer(async(req,res)=>{
  const send=(status:number,body:unknown)=>{res.writeHead(status,{"content-type":"application/json",
   "cache-control":"no-store"});res.end(JSON.stringify(body));};
  try{
   if(req.method==="GET"&&req.url==="/healthz")return send(200,{status:"ok",enabled:deps.enabled});
   if(!await deps.authenticate(req))return send(401,{error:"service_auth_required"});
   if(req.method==="GET"&&req.url==="/readyz")return send(deps.enabled&&await deps.ready()?200:503,
    {enabled:deps.enabled});
   if(!deps.enabled)return send(503,{error:"agent_runtime_disabled"});
   if(req.method!=="POST"||req.url!=="/internal/agent-runs/execute")return send(404,{error:"not_found"});
   let body="";
   for await(const part of req){body+=part.toString();if(Buffer.byteLength(body)>1024)return send(413,{error:"body_too_large"});}
   const input=JSON.parse(body) as Record<string,unknown>;
   if(Object.keys(input).sort().join(",")!=="ownerId,runId"||typeof input.ownerId!=="string"||typeof input.runId!=="string")
    return send(400,{error:"invalid_agent_request"});
   if(!await deps.ready())return send(503,{error:"agent_runtime_unavailable"});
   return send(200,await executeAgentRun(deps,input.ownerId,input.runId));
  }catch(error){return send(error instanceof SyntaxError?400:409,{error:"agent_execution_rejected"});}
 });
}
