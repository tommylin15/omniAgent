import type { Pool } from "pg";
import { describe,it,expect,vi } from "vitest";
import { BackgroundJobs } from "../services/chat-api/background_jobs.js";
import { WorkflowRunner,projectWorkflowSource,validateWorkflowConfig,workflowRecommendations,type WorkflowConfig } from "../services/chat-api/workflows.js";

const owner="11111111-1111-4111-8111-111111111111",jobId="33333333-3333-4333-8333-333333333333";
describe("durable leased jobs",()=>{
  it("requires configured handlers and bounded credential-free payloads before enqueue",async()=>{
    const query=vi.fn();const jobs=new BackgroundJobs({query} as unknown as Pool,{workflow:async()=>({})});
    await expect(jobs.enqueue(owner,"unknown","key",{})).rejects.toThrow();
    await expect(jobs.enqueue(owner,"workflow","key",{access_token:"secret"})).rejects.toThrow("credential");
    expect(query).not.toHaveBeenCalled();
  });
  it("uses skip-locked claims, lease fencing and meaningful-only notification outbox",async()=>{
    const queries:string[]=[];let count=0;
    const query=vi.fn(async(sql:string)=>{queries.push(sql);count++;
      if(count===2) return {rows:[{id:jobId,owner_id:owner,kind:"workflow",payload:{},idempotency_key:"key",state:"running",attempts:1}]};
      if(count===3) return {rows:[{id:jobId}]};
      return {rows:[]};});
    const handler=vi.fn(async()=>({changed:false}));
    await expect(new BackgroundJobs({query} as unknown as Pool,{workflow:handler},[owner]).runOne("worker")).resolves.toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(queries[1]).toContain("FOR UPDATE SKIP LOCKED");
    expect(queries[1]).toContain("owner_id=ANY");
    expect(queries.at(-1)).toContain("lease_token=$2");
    expect(queries.at(-1)).toContain("result->>'changed' IS DISTINCT FROM 'false'");
  });
  it("rejects schedules more frequent than hourly",async()=>{
    const jobs=new BackgroundJobs({} as Pool,{workflow:async()=>({})});
    await expect(jobs.schedule(owner,"workflow",{},60,new Date().toISOString())).rejects.toThrow("bounded schedule");
  });
});
describe("configured MCP source workflows",()=>{
  const config:WorkflowConfig={template:"github-drive-progress",sources:{
    github:{serverId:"github",toolName:"github__read",arguments:{},readOnly:true},
    drive:{serverId:"drive",toolName:"drive__read",arguments:{},readOnly:true}}};
  it("rejects missing source or non-read-only capability",()=>{
    expect(()=>validateWorkflowConfig(config)).not.toThrow();
    expect(()=>validateWorkflowConfig({...config,sources:{github:config.sources.github}})).toThrow();
    expect(()=>validateWorkflowConfig({...config,sources:{...config.sources,github:{...config.sources.github,readOnly:false as unknown as true}}})).toThrow();
  });
  it("projects only configured actual provider fields, leaving missing data explicit",()=>{
    expect(projectWorkflowSource({content:[{text:'{"rows":[{"name":"Task"}]}'}]},
      {rootPath:"content.0.text",parseJson:true,itemsPath:"rows",fields:{title:"name",due:"deadline"}})).toEqual([{title:"Task",due:null}]);
    expect(workflowRecommendations("weekly-life-plan",{})).toMatchObject({status:"configuration_required",missingProjections:["calendar","life"]});
  });
  it("proposes only free Calendar windows and never marks missing times valid",()=>{
    const now=Date.parse("2026-11-02T08:00:00Z");
    const report=workflowRecommendations("weekly-life-plan",{calendar:[{start:"2026-11-02T09:00:00Z",end:"2026-11-02T11:00:00Z"}],life:[{id:"task",title:"Plan",due:"2026-11-03T00:00:00Z"}]},now);
    expect(report).toMatchObject({status:"recommendations_ready",recommendations:[{proposedStart:"2026-11-02T11:00:00.000Z",requiresExplicitApproval:true}]});
    expect(workflowRecommendations("taiwan-activity-shadow",{taiwanActivity:[{title:"Visit",location:"Taipei",start:null,end:null}]},now)).toMatchObject({accepted:0,externalWrites:0});
  });
  it("returns durable same-job report after a restart without re-querying tools",async()=>{
    const stored={changed:true,sources:{github:[],drive:[]}};
    const pool={query:vi.fn(async()=>({rows:[{job_id:jobId,report:stored}]}))};const call=vi.fn();
    const runner=new WorkflowRunner(pool as unknown as Pool,{progress:config},call);
    expect(await runner.run("progress",{jobId,ownerId:owner,idempotencyKey:"key",signal:AbortSignal.timeout(1000),checkpoint:async()=>{}})).toBe(stored);
    expect(call).not.toHaveBeenCalled();
  });
});
