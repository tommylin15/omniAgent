import type { WorkflowConfig } from "../chat-api/workflows.js";
import { validateWorkflowConfig } from "../chat-api/workflows.js";
import { validateAnalyticsConfig, type AnalyticsConfig } from "../chat-api/archive.js";
import { approvedServiceOrigin } from "./archive_writer.js";
import {serviceTargetMatches} from "../agent-gateway/service_target.js";
import { parseJobQueueLimits,type JobQueueLimits } from "../chat-api/background_jobs.js";

export type JobWorkerConfig={enabled:boolean;audience?:string;callers:string[];owners:string[];workflows:Record<string,WorkflowConfig>;
  archive?:{url:string;audience:string;table:string;approved:true};analytics?:AnalyticsConfig;queueLimits?:JobQueueLimits};
export function parseJobWorkerConfig(env:NodeJS.ProcessEnv):JobWorkerConfig {
  const disabled:JobWorkerConfig={enabled:false,callers:[],owners:[],workflows:{}};
  if(env.AGENT_JOBS_ENABLED!=="true") return disabled;
  const queueLimits=parseJobQueueLimits(env.JOB_QUEUE_LIMITS_JSON??"");
  const audience=approvedServiceOrigin(env.AGENT_JOBS_AUDIENCE??"");
  const callers=(env.AGENT_JOBS_ALLOWED_EMAILS??"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const owners=(env.AGENT_JOBS_APPROVED_OWNER_IDS??"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!callers.length||callers.some(s=>!/^[-a-z0-9]+@[-a-z0-9]+\.iam\.gserviceaccount\.com$/.test(s))||
    !owners.length||owners.some(s=>!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s))) throw new Error("explicit worker service callers and owner grants required");
  const workflows=parseObject(env.AGENT_JOBS_WORKFLOWS_JSON??"{}") as Record<string,WorkflowConfig>;
  for(const [key,value] of Object.entries(workflows)) {
    if(!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new Error("invalid workflow key");validateWorkflowConfig(value);
  }
  let archive:JobWorkerConfig["archive"];
  if(env.ARCHIVE_ENABLED==="true") {
    const c=parseObject(env.AGENT_JOBS_ARCHIVE_CONFIG_JSON??"");
    if(c.approved!==true||typeof c.url!=="string"||typeof c.audience!=="string"||typeof c.table!=="string"||
      !/^[A-Za-z][A-Za-z0-9_]{0,62}\.[A-Za-z][A-Za-z0-9_]{0,62}\.[A-Za-z][A-Za-z0-9_]{0,62}$/.test(c.table)||!serviceTargetMatches(approvedServiceOrigin(c.url),c.audience))
      throw new Error("approved archive writer configuration required");
    archive={url:c.url,audience:c.audience,table:c.table,approved:true};
  }
  let analytics:AnalyticsConfig|undefined;
  if(env.ANALYTICS_ENABLED==="true") {analytics=parseObject(env.AGENT_JOBS_ANALYTICS_CONFIG_JSON??"") as AnalyticsConfig;validateAnalyticsConfig(analytics);}
  if(!Object.keys(workflows).length&&!archive&&!analytics) throw new Error("worker enabled without any configured handler");
  return {enabled:true,audience,callers,owners,workflows,archive,analytics,queueLimits};
}
export function parseObject(raw:string):Record<string,unknown> {
  if(Buffer.byteLength(raw)>131_072) throw new Error("worker configuration too large");
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error("worker configuration must be an object");
  return value as Record<string,unknown>;
}
