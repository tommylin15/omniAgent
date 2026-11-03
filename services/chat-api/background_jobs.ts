import { randomUUID,createHash } from "node:crypto";
import type { Pool } from "pg";
import { ChatConflict, ChatNotFound, safeRecord } from "./storage.js";

export type JobContext={ownerId:string;jobId:string;idempotencyKey:string;signal:AbortSignal;checkpoint:()=>Promise<void>};
export type JobHandler=(payload:Record<string,unknown>,context:JobContext)=>Promise<unknown>;
type Job={id:string;owner_id:string;kind:string;idempotency_key:string;payload:Record<string,unknown>;state:string;lease_token:string;attempts:number};
export type JobQueueLimits={maxOwnerPending:number;maxGlobalPending:number;maxOwnerSchedules:number;maxGlobalSchedules:number};
export function parseJobQueueLimits(raw:string):JobQueueLimits {
  if(typeof raw!=="string"||raw.length>4096)throw new Error("job queue limits required");
  let value:JobQueueLimits;try{value=JSON.parse(raw);}catch{throw new Error("invalid job queue limits");}
  const keys=["maxOwnerPending","maxGlobalPending","maxOwnerSchedules","maxGlobalSchedules"];
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==keys.length||
    keys.some(key=>!Object.hasOwn(value,key)||!Number.isSafeInteger(value[key as keyof JobQueueLimits])||value[key as keyof JobQueueLimits]<1)||
    value.maxOwnerPending>value.maxGlobalPending||value.maxOwnerSchedules>value.maxGlobalSchedules)throw new Error("invalid job queue limits");
  return value;
}
const ID=/^[A-Za-z0-9._:-]{1,128}$/;
function payloadJson(value:Record<string,unknown>):string {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new SyntaxError("job payload must be an object");
  const json=JSON.stringify(safeRecord(value));
  if(Buffer.byteLength(json)>65_536) throw new SyntaxError("job payload too large");return json;
}
export class BackgroundJobs {
  async list(ownerId:string):Promise<Record<string,unknown>[]>{
    return (await this.pool.query(`SELECT id,kind,state,attempts,cancel_requested,created_at,updated_at
      FROM omni_chat.background_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,[ownerId])).rows;
  }
  async schedules(ownerId:string):Promise<Record<string,unknown>[]>{
    return (await this.pool.query(`SELECT id,kind,payload,interval_seconds,next_run_at,enabled
      FROM omni_chat.job_schedules WHERE owner_id=$1 ORDER BY next_run_at LIMIT 100`,[ownerId])).rows;
  }
  constructor(private readonly pool:Pool,private readonly handlers:Record<string,JobHandler>,private readonly approvedOwners?:string[],private readonly limits?:JobQueueLimits) {
    if(approvedOwners && (!approvedOwners.length || approvedOwners.some(owner=>!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner)))) throw new Error("invalid worker owner grants");
    if(limits)this.limits=Object.freeze(parseJobQueueLimits(JSON.stringify(limits)));
  }
  private async quotaTransaction<T>(work:(db:Pick<Pool,"query">)=>Promise<T>):Promise<T> {
    if(!this.limits)return work(this.pool);
    const client=await this.pool.connect();
    try{await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");await client.query("SELECT pg_advisory_xact_lock(hashtextextended('omniagent-job-capacity',0))");
      const result=await work(client);await client.query("COMMIT");return result;
    }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
  }
  private async capacity(db:Pick<Pool,"query">,ownerId:string,schedules=false):Promise<void> {
    if(!this.limits)return;
    const sql=schedules?"SELECT count(*) FILTER(WHERE owner_id=$1)::text AS owner_count,count(*)::text AS global_count FROM omni_chat.job_schedules":
      "SELECT count(*) FILTER(WHERE owner_id=$1)::text AS owner_count,count(*)::text AS global_count FROM omni_chat.background_jobs WHERE state IN ('queued','running')";
    const usage=(await db.query(sql,[ownerId])).rows[0];
    if(!/^[0-9]+$/.test(String(usage?.owner_count))||!/^[0-9]+$/.test(String(usage?.global_count)))throw new Error("job capacity ledger unavailable");
    if(BigInt(usage.owner_count)+1n>BigInt(schedules?this.limits.maxOwnerSchedules:this.limits.maxOwnerPending)||
      BigInt(usage.global_count)+1n>BigInt(schedules?this.limits.maxGlobalSchedules:this.limits.maxGlobalPending))throw new ChatConflict(schedules?"schedule storage budget exhausted":"pending job budget exhausted");
  }
  private validate(kind:string,key:string,payload:Record<string,unknown>):string {
    if(!ID.test(kind) || !ID.test(key) || !Object.hasOwn(this.handlers,kind)) throw new SyntaxError("unsupported job kind or idempotency key");
    return payloadJson(payload);
  }
  async enqueue(ownerId:string,kind:string,key:string,payload:Record<string,unknown>):Promise<Record<string,unknown>> {
    return this.quotaTransaction(db=>this.enqueueReserved(db,ownerId,kind,key,payload));
  }
  private async enqueueReserved(db:Pick<Pool,"query">,ownerId:string,kind:string,key:string,payload:Record<string,unknown>):Promise<Record<string,unknown>> {
    const json=this.validate(kind,key,payload);
    if(this.limits){
      const previous=(await db.query("SELECT id,kind,state,payload=$3::jsonb AS same FROM omni_chat.background_jobs WHERE owner_id=$1 AND idempotency_key=$2",[ownerId,key,json])).rows[0];
      if(previous){if(previous.kind!==kind||!previous.same)throw new ChatConflict("job idempotency conflict");return {id:previous.id,state:previous.state};}
      await this.capacity(db,ownerId);
    }
    const result=await db.query(`INSERT INTO omni_chat.background_jobs(id,owner_id,kind,idempotency_key,payload,state)
      VALUES($1,$2,$3,$4,$5,'queued') ON CONFLICT(owner_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      RETURNING id,kind,payload,state`,[randomUUID(),ownerId,kind,key,json]);
    const row=result.rows[0];
    if(row.kind!==kind || JSON.stringify(row.payload)!==JSON.stringify(JSON.parse(json))) {
      // PostgreSQL jsonb reorders keys, so compare through its canonical equality.
      const same=await db.query("SELECT payload=$3::jsonb AS same FROM omni_chat.background_jobs WHERE owner_id=$1 AND id=$2",[ownerId,row.id,json]);
      if(row.kind!==kind || !same.rows[0]?.same) throw new ChatConflict("job idempotency conflict");
    }
    return {id:row.id,state:row.state};
  }
  async get(ownerId:string,id:string):Promise<Record<string,unknown>> {
    const result=await this.pool.query("SELECT id,kind,state,result,attempts,cancel_requested,created_at,updated_at FROM omni_chat.background_jobs WHERE owner_id=$1 AND id=$2",[ownerId,id]);
    if(!result.rows[0]) throw new ChatNotFound("job not found");return result.rows[0];
  }
  async cancel(ownerId:string,id:string):Promise<void> {
    await this.pool.query(`WITH changed AS (
      UPDATE omni_chat.background_jobs SET cancel_requested=true,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END,updated_at=now()
      WHERE owner_id=$1 AND id=$2 RETURNING *)
      INSERT INTO omni_chat.job_notifications(job_id,owner_id,state) SELECT id,owner_id,'cancelled' FROM changed WHERE state='cancelled'
      ON CONFLICT(job_id) DO NOTHING`,[ownerId,id]);
    await this.get(ownerId,id);
  }
  async schedule(ownerId:string,kind:string,payload:Record<string,unknown>,intervalSeconds:number,nextRunAt:string,key=randomUUID()):Promise<{id:string}> {
    const json=this.validate(kind,key,payload);
    if(!Number.isInteger(intervalSeconds)||intervalSeconds<3600||intervalSeconds>2_678_400 || !Number.isFinite(Date.parse(nextRunAt))) throw new SyntaxError("invalid bounded schedule");
    const id=randomUUID();
    const requestDigest=createHash("sha256").update(JSON.stringify([kind,JSON.parse(json),intervalSeconds,new Date(nextRunAt).toISOString()])).digest("hex");
    return this.quotaTransaction(async db=>{
    if(this.limits){
      const previous=(await db.query("SELECT id,request_digest FROM omni_chat.job_schedules WHERE owner_id=$1 AND idempotency_key=$2",[ownerId,key])).rows[0];
      if(previous){if(previous.request_digest!==requestDigest)throw new ChatConflict("schedule idempotency conflict");return {id:String(previous.id)};}
      await this.capacity(db,ownerId,true);
    }
    const saved=(await db.query(`INSERT INTO omni_chat.job_schedules
      (id,owner_id,kind,payload,interval_seconds,next_run_at,idempotency_key,request_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(owner_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      WHERE omni_chat.job_schedules.request_digest=EXCLUDED.request_digest
      RETURNING id`,[id,ownerId,kind,json,intervalSeconds,nextRunAt,key,requestDigest])).rows[0];
    if(!saved)throw new ChatConflict("schedule idempotency conflict");return {id:String(saved.id)};
    });
  }
  async setScheduleEnabled(ownerId:string,id:string,enabled:boolean):Promise<void> {
    if(typeof enabled!=="boolean") throw new SyntaxError("invalid schedule state");
    const result=await this.pool.query("UPDATE omni_chat.job_schedules SET enabled=$3 WHERE owner_id=$1 AND id=$2 RETURNING id",[ownerId,id,enabled]);
    if(!result.rows[0]) throw new ChatNotFound("schedule not found");
  }
  async tickSchedules():Promise<number> {
    if(this.limits)return this.quotaTransaction(async db=>{
      const due=await db.query(`SELECT * FROM omni_chat.job_schedules WHERE enabled AND next_run_at<=now()
        AND ($1::uuid[] IS NULL OR owner_id=ANY($1::uuid[])) ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 25`,[this.approvedOwners??null]);
      let queued=0;
      for(const row of due.rows){
        const key=`schedule:${row.id}:${new Date(row.next_run_at).toISOString()}`;
        try{await this.enqueueReserved(db,row.owner_id,row.kind,key,row.payload);}
        catch(error){if(error instanceof ChatConflict&&error.message==="pending job budget exhausted")continue;throw error;}
        await db.query("UPDATE omni_chat.job_schedules SET next_run_at=now()+interval_seconds*interval '1 second' WHERE id=$1",[row.id]);
        queued++;
      }
      return queued;
    });
    // One atomic statement prevents duplicate enqueue when schedulers race or crash.
    const result=await this.pool.query(`WITH due AS (
      SELECT * FROM omni_chat.job_schedules WHERE enabled AND next_run_at<=now() AND ($1::uuid[] IS NULL OR owner_id=ANY($1::uuid[])) ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 25
      ), inserted AS (
      INSERT INTO omni_chat.background_jobs(id,owner_id,kind,idempotency_key,payload,state)
      SELECT gen_random_uuid(),owner_id,kind,'schedule:'||id::text||':'||extract(epoch FROM next_run_at)::text,payload,'queued' FROM due
      ON CONFLICT(owner_id,idempotency_key) DO NOTHING RETURNING id)
      UPDATE omni_chat.job_schedules s SET next_run_at=now()+s.interval_seconds*interval '1 second' FROM due WHERE s.id=due.id RETURNING s.id`,[this.approvedOwners??null]);
    return result.rowCount??0;
  }
  async runOne(workerId:string):Promise<boolean> {
    if(!ID.test(workerId)) throw new SyntaxError("invalid worker identity");
    await this.pool.query(`WITH exhausted AS (
      UPDATE omni_chat.background_jobs SET state=CASE WHEN cancel_requested THEN 'cancelled' ELSE 'failed' END,
      result='{"error":"worker lease expired repeatedly; manual reconciliation required"}'::jsonb,lease_token=NULL,lease_until=NULL,updated_at=now()
      WHERE state='running' AND lease_until<now() AND attempts>=3 AND ($1::uuid[] IS NULL OR owner_id=ANY($1::uuid[])) RETURNING *)
      INSERT INTO omni_chat.job_notifications(job_id,owner_id,state,result) SELECT id,owner_id,state,result FROM exhausted ON CONFLICT(job_id) DO NOTHING`,[this.approvedOwners??null]);
    const lease=randomUUID();
    const claimed=await this.pool.query<Job>(`WITH candidate AS (
      SELECT id FROM omni_chat.background_jobs WHERE ((state='queued' AND available_at<=now()) OR
      (state='running' AND lease_until<now() AND attempts<3)) AND ($2::uuid[] IS NULL OR owner_id=ANY($2::uuid[])) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE omni_chat.background_jobs j SET state='running',lease_token=$1,lease_until=now()+interval '60 seconds',attempts=attempts+1,updated_at=now()
      FROM candidate WHERE j.id=candidate.id RETURNING j.*`,[lease,this.approvedOwners??null]);
    const job=claimed.rows[0];if(!job) return false;
    const started=Date.now();
    const controller=new AbortController();
    const checkpoint=async():Promise<void>=>{
      const result=await this.pool.query(`UPDATE omni_chat.background_jobs SET lease_until=now()+interval '60 seconds'
        WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now() AND NOT cancel_requested RETURNING id`,[job.id,lease]);
      if(!result.rows[0]) {controller.abort();throw new Error("job lease lost or cancelled");}
    };
    const heartbeat=setInterval(()=>{void checkpoint().catch(()=>{controller.abort();});},20_000);
    heartbeat.unref();
    const deadline=setTimeout(()=>controller.abort(),120_000);deadline.unref();
    let abortListener:()=>void=()=>{};
    const aborted=new Promise<never>((_,reject)=>{abortListener=()=>reject(new Error("job aborted"));controller.signal.addEventListener("abort",abortListener,{once:true});});
    void aborted.catch(()=>{});
    let state="succeeded",result:unknown;
    try {
      await checkpoint();
      if(!Object.hasOwn(this.handlers,job.kind)) throw new Error("job handler unavailable");
      controller.signal.throwIfAborted();
      result=safeRecord(await Promise.race([this.handlers[job.kind](job.payload,{ownerId:job.owner_id,jobId:job.id,idempotencyKey:job.idempotency_key,signal:controller.signal,checkpoint}),aborted]));
      if(Buffer.byteLength(JSON.stringify(result??null))>65_536) throw new Error("job result too large");
    } catch {state="failed";result={error:"job did not complete; inspect authorized worker evidence before retry"};}
    finally {clearInterval(heartbeat);clearTimeout(deadline);controller.signal.removeEventListener("abort",abortListener);}
    // A dead worker never overwrites the next worker's result. Cancellation wins even if a tool finished concurrently.
    await this.pool.query(`WITH finished AS (
      UPDATE omni_chat.background_jobs SET state=CASE WHEN cancel_requested THEN 'cancelled' ELSE $3 END,
      result=CASE WHEN cancel_requested THEN NULL ELSE $4::jsonb END,duration_ms=$5,lease_until=NULL,lease_token=NULL,updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now() RETURNING *)
      INSERT INTO omni_chat.job_notifications(job_id,owner_id,state,result) SELECT id,owner_id,state,result FROM finished
      WHERE state<>'succeeded' OR result->>'changed' IS DISTINCT FROM 'false'
      ON CONFLICT(job_id) DO NOTHING`,[job.id,lease,state,JSON.stringify(result??null),Date.now()-started]);
    return true;
  }
  async notifications(ownerId:string):Promise<Record<string,unknown>[]> {
    return (await this.pool.query("SELECT job_id,state,result,created_at FROM omni_chat.job_notifications WHERE owner_id=$1 AND delivered_at IS NULL ORDER BY created_at LIMIT 50",[ownerId])).rows;
  }
  async acknowledge(ownerId:string,jobId:string):Promise<void> {
    await this.pool.query("UPDATE omni_chat.job_notifications SET delivered_at=now() WHERE owner_id=$1 AND job_id=$2",[ownerId,jobId]);
  }
}
