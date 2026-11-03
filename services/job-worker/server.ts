import { createServer } from "node:http";
import type { BackgroundJobs } from "../chat-api/background_jobs.js";

export function makeJobWorkerServer(options:{enabled:boolean;jobs?:BackgroundJobs;workerId:string;
  verify:(token:string)=>Promise<void>;metrics:()=>Promise<unknown>}) {
  let busy=false;
  return createServer(async(req,res)=>{
    const reply=(status:number,value:unknown)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(value));};
    if(req.method==="GET"&&req.url==="/healthz") {reply(200,{status:"ok",enabled:options.enabled});return;}
    if(!["/internal/jobs/tick","/internal/jobs/metrics"].includes(req.url??"")) {reply(404,{error:"not_found"});return;}
    const authorization=req.headers.authorization;
    try {if(!authorization?.startsWith("Bearer ") || authorization.length>16_384) throw new Error();await options.verify(authorization.slice(7));}
    catch {reply(401,{error:"unauthorized"});return;}
    if(!options.enabled||!options.jobs) {reply(503,{error:"job_worker_disabled"});return;}
    let claimed=false;
    try {
      if(req.method==="GET"&&req.url==="/internal/jobs/metrics") {reply(200,await options.metrics());return;}
      if(req.method!=="POST"||req.url!=="/internal/jobs/tick") {reply(405,{error:"method_not_allowed"});return;}
      let body="";
      for await(const chunk of req) {body+=chunk.toString();if(Buffer.byteLength(body)>1024) {reply(413,{error:"request_too_large"});return;}}
      let value:Record<string,unknown>;
      try {value=body?JSON.parse(body):{};}catch {reply(400,{error:"invalid_json"});return;}
      if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).some(key=>key!=="maxJobs") ||
        (value.maxJobs!==undefined&&(!Number.isInteger(value.maxJobs)||Number(value.maxJobs)<1||Number(value.maxJobs)>3))) {reply(400,{error:"invalid_tick_bound"});return;}
      if(busy) {reply(429,{error:"worker_tick_in_progress"});return;}
      busy=true;claimed=true;
      const started=Date.now();const scheduled=await options.jobs.tickSchedules();let processed=0;
      while(processed<Number(value.maxJobs??1)&&Date.now()-started<180_000) {
        if(!await options.jobs.runOne(options.workerId)) break;processed++;
      }
      reply(200,{scheduled,processed,durationMs:Date.now()-started});
    } catch {reply(503,{error:"job_worker_outcome_requires_reconciliation"});}
    finally {if(claimed) busy=false;}
  });
}
