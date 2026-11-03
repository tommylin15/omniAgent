import type { Pool } from "pg";
import { describe,it,expect,vi } from "vitest";
import { ArtifactService,parseArtifactLimits } from "../services/chat-api/artifacts.js";
import { BackgroundJobs,parseJobQueueLimits } from "../services/chat-api/background_jobs.js";
import { BoundedAnalytics,validateAnalyticsConfig } from "../services/chat-api/archive.js";

const owner="11111111-1111-4111-8111-111111111111",id="33333333-3333-4333-8333-333333333333";
const artifactLimits={maxOwnerBytes:100,maxGlobalBytes:200,maxOwnerObjects:2,maxGlobalObjects:4};
const jobLimits={maxOwnerPending:2,maxGlobalPending:4,maxOwnerSchedules:2,maxGlobalSchedules:4};
const input={idempotencyKey:"same",sha256:"a".repeat(64),byteLength:1,contentType:"text/plain"};
function transaction(respond:(sql:string,args?:unknown[])=>unknown) {
  const query=vi.fn(async(sql:string,args?:unknown[])=>respond(sql,args)??{rows:[]});
  const release=vi.fn();const connect=vi.fn(async()=>({query,release}));
  return {pool:{connect} as unknown as Pool,query,release};
}
describe("explicit artifact and pending-work budgets",()=>{
  it("has no invented defaults or permissive malformed budgets",()=>{
    for(const raw of ["","{}","null",JSON.stringify({...artifactLimits,maxOwnerBytes:201}),JSON.stringify({...artifactLimits,maxOwnerObjects:0}),JSON.stringify({...artifactLimits,extra:1})])
      expect(()=>parseArtifactLimits(raw)).toThrow();
    for(const raw of ["","{}",JSON.stringify({...jobLimits,maxOwnerPending:5}),JSON.stringify({...jobLimits,maxGlobalSchedules:1.5})])
      expect(()=>parseJobQueueLimits(raw)).toThrow();
    expect(parseArtifactLimits(JSON.stringify(artifactLimits))).toEqual(artifactLimits);
    expect(parseJobQueueLimits(JSON.stringify(jobLimits))).toEqual(jobLimits);
  });
  it("locks and checks all artifact states before reservation or cloud writes",async()=>{
    const tx=transaction(sql=>sql.includes("sum(byte_length)")?{rows:[{owner_bytes:"100",global_bytes:"100",owner_objects:"1",global_objects:"1"}]}:undefined);
    const objects={put:vi.fn(),get:vi.fn()};
    const artifacts=new ArtifactService(tx.pool,objects,"s".repeat(32),artifactLimits);
    await expect(artifacts.reserve(owner,input)).rejects.toThrow("storage budget exhausted");
    const sql=tx.query.mock.calls.map(call=>call[0]);
    expect(sql[1]).toContain("pg_advisory_xact_lock");
    expect(sql.find(s=>s.includes("sum(byte_length)"))).not.toContain("WHERE state");
    expect(sql.some(s=>s.startsWith("INSERT"))).toBe(false);
    expect(sql.at(-1)).toBe("ROLLBACK");expect(tx.release).toHaveBeenCalledOnce();expect(objects.put).not.toHaveBeenCalled();
  });
  it("returns an existing matching artifact even when quota is full without counting it twice",async()=>{
    const tx=transaction(sql=>sql.startsWith("SELECT *")?{rows:[{id,sha256:input.sha256,byte_length:"1",content_type:input.contentType,state:"available"}]}:undefined);
    const artifacts=new ArtifactService(tx.pool,{put:vi.fn(),get:vi.fn()},"s".repeat(32),artifactLimits);
    await expect(artifacts.reserve(owner,input)).resolves.toMatchObject({id,state:"available"});
    expect(tx.query.mock.calls.some(([sql])=>sql.includes("sum(byte_length)")||sql.startsWith("INSERT"))).toBe(false);
    expect(tx.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
  it("refuses a new pending job before INSERT when owner capacity is full",async()=>{
    const tx=transaction(sql=>sql.includes("count(*)")?{rows:[{owner_count:"2",global_count:"2"}]}:undefined);
    const jobs=new BackgroundJobs(tx.pool,{workflow:async()=>({})},[owner],jobLimits);
    await expect(jobs.enqueue(owner,"workflow","new",{})).rejects.toThrow("pending job budget exhausted");
    expect(tx.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
    expect(tx.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("does not double charge an idempotent queued job",async()=>{
    const tx=transaction(sql=>sql.includes("payload=$3")?{rows:[{id,kind:"workflow",state:"queued",same:true}]}:undefined);
    await expect(new BackgroundJobs(tx.pool,{workflow:async()=>({})},[owner],jobLimits).enqueue(owner,"workflow","same",{})).resolves.toEqual({id,state:"queued"});
    expect(tx.query.mock.calls.some(([sql])=>sql.includes("count(*)")||sql.startsWith("INSERT"))).toBe(false);
  });
  it("counts disabled schedules as stored records before creating another",async()=>{
    const tx=transaction(sql=>sql.includes("count(*)")?{rows:[{owner_count:"2",global_count:"2"}]}:undefined);
    const jobs=new BackgroundJobs(tx.pool,{workflow:async()=>({})},[owner],jobLimits);
    await expect(jobs.schedule(owner,"workflow",{},3600,"2026-11-03T00:00:00Z","new")).rejects.toThrow("schedule storage budget exhausted");
    expect(tx.query.mock.calls.find(([sql])=>sql.includes("count(*)"))?.[0]).not.toContain("enabled");
    expect(tx.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
  });
  it("leaves a saturated due schedule unadvanced so the worker can drain existing jobs",async()=>{
    const tx=transaction(sql=>{
      if(sql.startsWith("SELECT * FROM omni_chat.job_schedules"))return {rows:[{id,owner_id:owner,kind:"workflow",payload:{},next_run_at:"2026-11-03T00:00:00Z"}]};
      if(sql.includes("count(*)"))return {rows:[{owner_count:"2",global_count:"2"}]};
    });
    await expect(new BackgroundJobs(tx.pool,{workflow:async()=>({})},[owner],jobLimits).tickSchedules()).resolves.toBe(0);
    expect(tx.query.mock.calls.some(([sql])=>sql.startsWith("INSERT")||sql.startsWith("UPDATE"))).toBe(false);
    expect(tx.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
  it("requires explicit owner/global daily query ceilings and rejects quota before any Google request",async()=>{
    const config={approved:true as const,project:"valid-project",dataset:"reports",table:"events",location:"asia-east1",maximumBytesBilled:1000,maxOwnerDailyQueries:2,maxGlobalDailyQueries:4};
    expect(()=>validateAnalyticsConfig({...config,maxOwnerDailyQueries:5})).toThrow();
    expect(()=>validateAnalyticsConfig({...config,maxGlobalDailyQueries:undefined as unknown as number})).toThrow();
    const tx=transaction(sql=>sql.includes("count(*)")?{rows:[{owner_count:"2",global_count:"2"}]}:undefined);
    const request=vi.fn();const analytics=new BoundedAnalytics(tx.pool,config,undefined,request);
    await expect(analytics.query(owner,new Date(Date.now()-1000).toISOString(),10,"bounded-query")).rejects.toThrow("daily query budget exhausted");
    expect(request).not.toHaveBeenCalled();
    expect(tx.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
    expect(tx.query.mock.calls.find(([sql])=>sql.includes("count(*)"))?.[0]).toContain("AT TIME ZONE 'UTC'");
    expect(tx.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");expect(tx.release).toHaveBeenCalledOnce();
  });
});
