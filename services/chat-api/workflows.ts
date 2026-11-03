import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { JobContext, JobHandler } from "./background_jobs.js";
import { safeRecord } from "./storage.js";

export const WORKFLOW_TEMPLATES={
  "github-drive-progress":{required:["github","drive"],optional:[],purpose:"GitHub and OmniAgentGPT Drive diff/progress evidence"},
  "weekly-life-plan":{required:["calendar","life"],optional:[],purpose:"Weekly Calendar and Life planning evidence"},
  "janus-life-risk":{required:["janus","life"],optional:[],purpose:"Janus read-only risk summary and local Life report"},
  "taiwan-activity-shadow":{required:["taiwanActivity"],optional:[],purpose:"TaiwanActivity shadow evaluation only"},
  "gmail-life-inbox":{required:["gmail","life"],optional:[],purpose:"Optional Gmail OAuth grant and Life inbox planning evidence"}
} as const;
export type WorkflowTemplate=keyof typeof WORKFLOW_TEMPLATES;
export type SourceProjection={rootPath?:string;parseJson?:boolean;itemsPath:string;fields:Record<string,string>};
export type WorkflowSource={serverId:string;toolName:string;arguments:Record<string,unknown>;readOnly:true;projection?:SourceProjection;
  argumentBindings?:Record<string,"ownerId"|"now"|"weekStart"|"weekEnd">};
export type WorkflowConfig={template:WorkflowTemplate;sources:Record<string,WorkflowSource>};
export type AuthenticatedMcpCall=(ownerId:string,serverId:string,operation:"call",value:Record<string,unknown>)=>Promise<unknown>;
function canonical(value:unknown):string {
  if(Array.isArray(value)) return "["+value.map(canonical).join(",")+"]";
  if(value&&typeof value==="object") return "{"+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",")+"}";
  return JSON.stringify(value)??"null";
}
const hash=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
function recordDiff(before:unknown,after:unknown):Record<string,unknown> {
  if(!Array.isArray(after)||!after.every(v=>v&&typeof v==="object")) return {status:"source_changed"};
  const entries=(items:unknown[])=>new Map(items.map((item,index)=>{
    const value=item as Record<string,unknown>;
    const key=typeof value.id==="string"?value.id.slice(0,256):`row:${index}`;
    return [key,hash(item)];
  }));
  const old=entries(Array.isArray(before)?before:[]),next=entries(after);
  const added=[...next.keys()].filter(key=>!old.has(key)),removed=[...old.keys()].filter(key=>!next.has(key));
  const updated=[...next.keys()].filter(key=>old.has(key)&&old.get(key)!==next.get(key));
  return {addedCount:added.length,removedCount:removed.length,updatedCount:updated.length,added:added.slice(0,20),removed:removed.slice(0,20),updated:updated.slice(0,20)};
}
export function validateWorkflowConfig(config:WorkflowConfig):void {
  if(!config||!Object.hasOwn(WORKFLOW_TEMPLATES,config.template)||!config.sources||typeof config.sources!=="object"||Array.isArray(config.sources)) throw new SyntaxError("invalid workflow template");
  const template=WORKFLOW_TEMPLATES[config.template];
  const required:readonly string[]=template.required;
  if(Object.keys(config.sources).length!==required.length || required.some(name=>!Object.hasOwn(config.sources,name))) throw new SyntaxError("workflow sources do not match template");
  for(const source of Object.values(config.sources)) {
    if(!source || source.readOnly!==true || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(source.serverId) ||
      typeof source.toolName!=="string" || !source.toolName.startsWith(source.serverId+"__") || !/^[A-Za-z0-9._:-]{1,192}$/.test(source.toolName) ||
      !source.arguments || typeof source.arguments!=="object" || Array.isArray(source.arguments) || Buffer.byteLength(JSON.stringify(safeRecord(source.arguments)))>8192)
      throw new SyntaxError("invalid bounded read-only MCP workflow source");
    if(source.argumentBindings && (typeof source.argumentBindings!=="object" || Array.isArray(source.argumentBindings) || Object.keys(source.argumentBindings).length>8 ||
      Object.entries(source.argumentBindings).some(([key,value])=>!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)||["constructor","prototype","__proto__"].includes(key)||!["ownerId","now","weekStart","weekEnd"].includes(value))))
      throw new SyntaxError("invalid workflow context bindings");
    if(source.projection) {
      const p=source.projection;
      const path=(v:unknown)=>typeof v==="string"&&/^(?:[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)?$/.test(v)&&v.length<=256&&v.split(".").every(s=>!["__proto__","prototype","constructor"].includes(s));
      if(!path(p.itemsPath)||(p.rootPath!==undefined&&!path(p.rootPath))||(p.parseJson!==undefined&&typeof p.parseJson!=="boolean")||
        !p.fields||typeof p.fields!=="object"||Array.isArray(p.fields)||!Object.keys(p.fields).length||Object.keys(p.fields).length>16||
        Object.entries(p.fields).some(([key,value])=>!["id","title","summary","url","status","priority","start","end","due","updatedAt","risk","severity","location","unread"].includes(key)||!path(value)))
        throw new SyntaxError("invalid operator-configured workflow projection");
    }
  }
}
type NormalizedItem=Record<string,string|number|boolean|null>;
function at(value:unknown,path:string):unknown {
  if(!path) return value;
  for(const part of path.split(".")) {
    if(!value||typeof value!=="object"||!Object.hasOwn(value,part)) return undefined;
    value=(value as Record<string,unknown>)[part];
  }
  return value;
}
export function projectWorkflowSource(value:unknown,projection:SourceProjection):NormalizedItem[] {
  let root=at(value,projection.rootPath??"");
  if(projection.parseJson) {if(typeof root!=="string") throw new Error("configured workflow JSON root is missing");root=JSON.parse(root);}
  const list=at(root,projection.itemsPath);
  if(!Array.isArray(list)||list.length>100) throw new Error("configured workflow source must return at most 100 records");
  return list.map(item=>Object.fromEntries(Object.entries(projection.fields).map(([field,path])=>{
    const result=at(item,path);
    if(result!==undefined&&result!==null&&!["string","number","boolean"].includes(typeof result)) throw new Error("workflow projected field is not scalar");
    if(typeof result==="string"&&result.length>2000) throw new Error("workflow projected field too long");
    return [field,result??null];
  })) as NormalizedItem);
}
export function workflowRecommendations(template:WorkflowTemplate,normalized:Record<string,NormalizedItem[]>,now=Date.now()):Record<string,unknown> {
  const required:readonly string[]=WORKFLOW_TEMPLATES[template].required;
  const missing=required.filter(slot=>!Object.hasOwn(normalized,slot));
  if(missing.length) return {status:"configuration_required",missingProjections:missing,recommendations:[]};
  const text=(v:unknown)=>typeof v==="string"?v:"";
  if(template==="weekly-life-plan") {
    const events=normalized.calendar;
    const tasks=normalized.life.filter(t=>!/\b(done|completed|cancelled)\b/i.test(text(t.status))).slice(0,20);
    const invalidEvents=events.filter(e=>!Number.isFinite(Date.parse(text(e.start)))||!Number.isFinite(Date.parse(text(e.end)))||Date.parse(text(e.end))<=Date.parse(text(e.start)));
    if(invalidEvents.length) return {status:"source_fields_missing",invalidCalendarEvents:invalidEvents.length,recommendations:[]};
    // UTC planning windows are explicit; clients may display proposed times in their preferred zone.
    const windows:{start:string;end:string}[]=[];
    for(let day=0;day<7;day++) {
      const date=new Date(now+day*86400_000);date.setUTCHours(9,0,0,0);
      const finish=date.getTime()+9*3600_000;let cursor=Math.max(date.getTime(),now);
      const busy=events.map(e=>({start:Date.parse(text(e.start)),end:Date.parse(text(e.end))})).filter(e=>e.end>cursor&&e.start<finish).sort((a,b)=>a.start-b.start);
      for(const event of busy) {if(event.start-cursor>=1800_000) windows.push({start:new Date(cursor).toISOString(),end:new Date(Math.min(event.start,finish)).toISOString()});cursor=Math.max(cursor,event.end);}
      if(finish-cursor>=1800_000) windows.push({start:new Date(cursor).toISOString(),end:new Date(finish).toISOString()});
    }
    const sorted=tasks.sort((a,b)=>(Date.parse(text(a.due))||Infinity)-(Date.parse(text(b.due))||Infinity));
    return {status:"recommendations_ready",timeZone:"UTC",planningHours:"09:00–18:00",unscheduledTasks:Math.max(0,sorted.length-windows.length),
      recommendations:sorted.slice(0,windows.length).map((task,index)=>({taskId:task.id??null,title:task.title??null,due:task.due??null,proposedStart:windows[index].start,
        proposedEnd:new Date(Date.parse(windows[index].start)+1800_000).toISOString(),requiresExplicitApproval:true}))};
  }
  if(template==="janus-life-risk") {
    const risks=normalized.janus.map(item=>({id:item.id??null,title:item.title??item.summary??null,risk:item.risk??null,severity:item.severity??null}));
    return {status:"report_ready",riskSignals:risks,missingRiskValues:risks.filter(r=>r.risk===null&&r.severity===null).length,
      lifeItemsToReview:normalized.life.map(t=>({id:t.id??null,title:t.title??null})),recommendation:"Review source risk signals alongside Life commitments; this workflow performs no trading or portfolio change."};
  }
  if(template==="taiwan-activity-shadow") {
    const seen=new Set<string>();
    const candidates=normalized.taiwanActivity.map(item=>{
      const issues:string[]=[];
      if(!text(item.title)) issues.push("missing_title");if(!text(item.location)) issues.push("missing_location");
      const start=Date.parse(text(item.start)),end=Date.parse(text(item.end));
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) issues.push("invalid_time_range");else if(end<=now) issues.push("past_activity");
      const key=text(item.id)||text(item.title)+":"+text(item.start);if(seen.has(key)) issues.push("duplicate_candidate");seen.add(key);
      return {id:item.id??null,title:item.title??null,valid:issues.length===0,issues};
    });
    return {status:"shadow_evaluated",candidates,accepted:candidates.filter(c=>c.valid).length,externalWrites:0};
  }
  if(template==="gmail-life-inbox") return {status:"triage_ready",messages:normalized.gmail.filter(m=>m.unread!==false).map(m=>({id:m.id??null,title:m.title??null,due:m.due??null,priority:m.priority??null})),
    lifeItems:normalized.life.map(t=>({id:t.id??null,title:t.title??null})),externalWrites:0};
  return {status:"progress_report_ready",github:normalized.github,drive:normalized.drive};
}
// Configurations are trusted deployment configuration, not request payloads. The injected callable
// must enforce the owner's existing authenticated MCP read-only grants; labels alone confer no access.
export class WorkflowRunner {
  private readonly configs:Record<string,WorkflowConfig>;
  constructor(private readonly pool:Pool,configs:Record<string,WorkflowConfig>,private readonly call:AuthenticatedMcpCall) {
    for(const [key,config] of Object.entries(configs)) {
      if(!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new Error("invalid workflow key");validateWorkflowConfig(config);
    }
    this.configs=structuredClone(configs);
  }
  handler():JobHandler {
    return async(payload,context)=>{
      if(Object.keys(payload).some(key=>key!=="workflowKey") || typeof payload.workflowKey!=="string") throw new SyntaxError("invalid workflow job payload");
      return this.run(payload.workflowKey,context);
    };
  }
  async run(key:string,context:JobContext):Promise<Record<string,unknown>> {
    const config=Object.hasOwn(this.configs,key)?this.configs[key]:undefined;if(!config) throw new Error("workflow is not configured");
    const scope=key+":"+hash(config);
    const previous=(await this.pool.query("SELECT job_id,digest,report FROM omni_chat.workflow_checkpoints WHERE owner_id=$1 AND workflow_key=$2",[context.ownerId,scope])).rows[0];
    if(previous?.job_id===context.jobId) return previous.report;
    const sourceResults:Record<string,unknown>={};
    const normalized:Record<string,NormalizedItem[]>={};
    const now=new Date(),weekStart=new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate()-(weekStart.getUTCDay()+6)%7);weekStart.setUTCHours(0,0,0,0);
    const bindings={ownerId:context.ownerId,now:now.toISOString(),weekStart:weekStart.toISOString(),weekEnd:new Date(weekStart.getTime()+7*86400_000).toISOString()};
    for(const [slot,source] of Object.entries(config.sources)) {
      await context.checkpoint();context.signal.throwIfAborted();
      const requestId=createHash("sha256").update(context.jobId+":"+slot).digest("hex");
      const args={...structuredClone(source.arguments),...Object.fromEntries(Object.entries(source.argumentBindings??{}).map(([name,binding])=>[name,bindings[binding]]))};
      const result=safeRecord(await this.call(context.ownerId,source.serverId,"call",{requestId,toolName:source.toolName,arguments:args}));
      context.signal.throwIfAborted();
      if(result&&typeof result==="object"&&"isError" in result&&result.isError===true) throw new Error("workflow MCP source failed");
      if(Buffer.byteLength(JSON.stringify(result??null))>24_000) throw new Error("workflow source exceeds bounded result size");
      if(source.projection) {normalized[slot]=projectWorkflowSource(result,source.projection);sourceResults[slot]=normalized[slot];}
      else sourceResults[slot]=result;
    }
    const digest=hash(sourceResults);
    const before=(previous?.report as {sources?:Record<string,unknown>}|undefined)?.sources;
    const changedSources=Object.keys(sourceResults).filter(name=>!before||hash(before[name])!==hash(sourceResults[name]));
    const report={template:config.template,purpose:WORKFLOW_TEMPLATES[config.template].purpose,mode:config.template==="taiwan-activity-shadow"?"shadow-only":"read-only",
      changed:previous?.digest!==digest,changedSources,sources:sourceResults,
      sourceDiff:Object.fromEntries(changedSources.map(slot=>[slot,recordDiff(before?.[slot],sourceResults[slot])])),
      recommendations:workflowRecommendations(config.template,normalized),
      limitations:"Source evidence and changes only; no external calendar, mail, Life, trading, or activity action is performed."};
    if(Buffer.byteLength(JSON.stringify(report))>60_000) throw new Error("workflow report exceeds bounded size");
    await context.checkpoint();
    const saved=await this.pool.query(`INSERT INTO omni_chat.workflow_checkpoints(owner_id,workflow_key,job_id,digest,report) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(owner_id,workflow_key) DO UPDATE SET job_id=EXCLUDED.job_id,digest=EXCLUDED.digest,report=EXCLUDED.report,updated_at=now()
      WHERE omni_chat.workflow_checkpoints.job_id IS NOT DISTINCT FROM $6::uuid RETURNING job_id`,[context.ownerId,scope,context.jobId,digest,JSON.stringify(report),previous?.job_id??null]);
    if(!saved.rows[0]) return {...report,changed:false,checkpointStatus:"superseded_by_concurrent_job"};
    return report;
  }
}
