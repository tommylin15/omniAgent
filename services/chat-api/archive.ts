import { createHash,randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { GoogleAuth } from "google-auth-library";
import { ArtifactService } from "./artifacts.js";
import { ChatConflict, ChatNotFound } from "./storage.js";

export type SnapshotReceipt={format:"iceberg";exportId:string;ownerId:string;sourceSha256:string;
  table:string;snapshotId:string;committed:boolean;recordCount:number};
export type ArchiveWriterRequest={operation:"commit"|"lookup";exportId:string;ownerId:string;sourceSha256:string;
  table:string;contentType?:string;bytesBase64?:string};
// Deployment supplies an authenticated bounded API/MCP adapter. This is an application contract,
// never a claim that an external MCP server exposes an invented tool.
export type ArchiveWriter=(request:ArchiveWriterRequest,signal:AbortSignal)=>Promise<unknown>;
export function validateSnapshotReceipt(value:unknown,request:ArchiveWriterRequest):SnapshotReceipt {
  const r=value as SnapshotReceipt;
  if(!r || typeof r!=="object" || r.format!=="iceberg" || r.exportId!==request.exportId || r.ownerId!==request.ownerId ||
    r.sourceSha256!==request.sourceSha256 || r.table!==request.table || r.committed!==true ||
    typeof r.snapshotId!=="string" || !/^[1-9][0-9]{0,18}$/.test(r.snapshotId) || BigInt(r.snapshotId)>9_223_372_036_854_775_807n || r.recordCount!==1)
    throw new Error("archive writer did not return a verified Iceberg snapshot receipt");
  return {format:r.format,exportId:r.exportId,ownerId:r.ownerId,sourceSha256:r.sourceSha256,table:r.table,snapshotId:r.snapshotId,committed:true,recordCount:r.recordCount};
}
export class ArchiveService {
  constructor(private readonly pool:Pool,private readonly artifacts:ArtifactService,
    private readonly config?:{table:string;writer:ArchiveWriter}) {
    if(config && !/^[A-Za-z][A-Za-z0-9_]{0,62}\.[A-Za-z][A-Za-z0-9_]{0,62}\.[A-Za-z][A-Za-z0-9_]{0,62}$/.test(config.table)) throw new Error("invalid approved Iceberg table");
  }
  async archive(ownerId:string,artifactId:string,key:string,signal=AbortSignal.timeout(60_000)):Promise<Record<string,unknown>> {
    if(!this.config) throw new Error("Iceberg archive writer is not configured");
    if(!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new SyntaxError("invalid archive idempotency key");
    const artifact=await this.artifacts.readVerified(ownerId,artifactId);
    const result=await this.pool.query(`INSERT INTO omni_chat.archive_exports(id,owner_id,idempotency_key,artifact_id,sha256,table_name,state)
      VALUES($1,$2,$3,$4,$5,$6,'pending') ON CONFLICT(owner_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING *`,
      [randomUUID(),ownerId,key,artifactId,artifact.sha256,this.config.table]);
    const row=result.rows[0];
    if(row.artifact_id!==artifactId || row.sha256!==artifact.sha256 || row.table_name!==this.config.table) throw new ChatConflict("archive idempotency conflict");
    const request:ArchiveWriterRequest={operation:"lookup",exportId:row.id,ownerId,sourceSha256:artifact.sha256,table:this.config.table};
    try {
      // Lookup first recovers an already committed export after a lost response or worker restart.
      let receipt=await this.config.writer(request,signal);
      if(receipt===null) {
        await this.pool.query("UPDATE omni_chat.archive_exports SET state='uncertain',updated_at=now() WHERE owner_id=$1 AND id=$2 AND state<>'verified'",[ownerId,row.id]);
        await this.config.writer({...request,operation:"commit",contentType:artifact.contentType,bytesBase64:artifact.bytes.toString("base64")},signal);
        receipt=await this.config.writer(request,signal);
      }
      const verified=validateSnapshotReceipt(receipt,request);
      await this.pool.query("UPDATE omni_chat.archive_exports SET state='verified',snapshot_receipt=$3,updated_at=now() WHERE owner_id=$1 AND id=$2",[ownerId,row.id,JSON.stringify(verified)]);
      return {id:row.id,state:"verified",receipt:verified};
    } catch {
      await this.pool.query("UPDATE omni_chat.archive_exports SET state='uncertain',updated_at=now() WHERE owner_id=$1 AND id=$2 AND state<>'verified'",[ownerId,row.id]);
      throw new ChatConflict("archive outcome uncertain; retry the same idempotency key to reconcile");
    }
  }
}

export type AnalyticsConfig={project:string;dataset:string;table:string;location:string;maximumBytesBilled:number;
  maxOwnerDailyQueries:number;maxGlobalDailyQueries:number;approved:true};
export function validateAnalyticsConfig(c:AnalyticsConfig):void {
  if(c.approved!==true || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(c.project) ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(c.dataset) || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(c.table) ||
    !/^[A-Za-z0-9-]{2,40}$/.test(c.location) || !Number.isSafeInteger(c.maximumBytesBilled) ||
    c.maximumBytesBilled<1 || c.maximumBytesBilled>1_073_741_824 || !Number.isSafeInteger(c.maxOwnerDailyQueries)||c.maxOwnerDailyQueries<1||
    !Number.isSafeInteger(c.maxGlobalDailyQueries)||c.maxGlobalDailyQueries<1||c.maxOwnerDailyQueries>c.maxGlobalDailyQueries) throw new Error("invalid approved analytics resource or budget");
}
// A configured BigQuery table or BigLake external table must expose owner_id and event_time.
// No user SQL or resource names enter this query; absent explicit configuration the service is disabled.
export class BoundedAnalytics {
  constructor(private readonly pool:Pool,private readonly config?:AnalyticsConfig,
    private readonly auth=new GoogleAuth({scopes:["https://www.googleapis.com/auth/bigquery"]}),private readonly request:typeof fetch=fetch) {
    if(config) validateAnalyticsConfig(config);
  }
  private async call(path:string,body?:Record<string,unknown>):Promise<Record<string,unknown>> {
    if(!this.config) throw new Error("analytics is not configured or approved");
    const token=await this.auth.getAccessToken();if(!token) throw new Error("analytics service identity unavailable");
    const response=await this.request(`https://bigquery.googleapis.com/bigquery/v2/projects/${this.config.project}/${path}`,
      {method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,
        signal:AbortSignal.timeout(15_000),redirect:"error"});
    if(!response.ok) {await response.body?.cancel();throw new Error("bounded analytics request unavailable");}
    const text=await readBoundedResponse(response,2_000_000);return JSON.parse(text) as Record<string,unknown>;
  }
  async query(ownerId:string,since:string,limit=100,key=randomUUID()):Promise<{id:string;state:string}> {
    const c=this.config;if(!c) throw new Error("analytics is not configured or approved");
    const start=Date.parse(since),now=Date.now();
    if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ownerId) || !/^[A-Za-z0-9._:-]{1,128}$/.test(key) || !Number.isFinite(start) || start<now-31*86400_000 || start>now || !Number.isInteger(limit)||limit<1||limit>1000)
      throw new SyntaxError("invalid bounded analytics query");
    const digest=createHash("sha256").update(JSON.stringify({resource:[c.project,c.dataset,c.table,c.location],since:new Date(start).toISOString(),limit,maximumBytesBilled:c.maximumBytesBilled})).digest("hex");
    const freshId=randomUUID();
    // Reserve before network I/O: a lost jobs.insert response can be read back by the same job ID.
    const client=await this.pool.connect();let saved:Record<string,unknown>;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('omniagent-analytics-daily-capacity',0))");
      const existing=(await client.query("SELECT id,remote_job_id,request_digest FROM omni_chat.analytics_queries WHERE owner_id=$1 AND idempotency_key=$2",[ownerId,key])).rows[0];
      if(existing)saved=existing;
      else {
        const usage=(await client.query(`SELECT count(*) FILTER(WHERE owner_id=$1)::text AS owner_count,count(*)::text AS global_count
          FROM omni_chat.analytics_queries WHERE created_at >= (date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,[ownerId])).rows[0];
        if(!/^[0-9]+$/.test(String(usage?.owner_count))||!/^[0-9]+$/.test(String(usage?.global_count)))throw new Error("analytics budget ledger unavailable");
        if(BigInt(usage.owner_count)+1n>BigInt(c.maxOwnerDailyQueries)||BigInt(usage.global_count)+1n>BigInt(c.maxGlobalDailyQueries))throw new ChatConflict("analytics daily query budget exhausted");
        saved=(await client.query(`INSERT INTO omni_chat.analytics_queries(id,owner_id,remote_job_id,location,idempotency_key,request_digest,project_id,created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()) RETURNING id,remote_job_id,request_digest`,
          [freshId,ownerId,"oa_"+freshId.replaceAll("-",""),c.location,key,digest,c.project])).rows[0];
      }
      if(!saved||saved.request_digest!==digest)throw new ChatConflict("analytics idempotency conflict");
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
    const id=String(saved.id),jobId=String(saved.remote_job_id);
    try {
      await this.call("jobs",{jobReference:{projectId:c.project,jobId,location:c.location},configuration:{jobTimeoutMs:"10000",query:{
        query:`SELECT * FROM \`${c.project}.${c.dataset}.${c.table}\` WHERE owner_id=@owner AND event_time>=@since ORDER BY event_time DESC LIMIT ${limit}`,
        useLegacySql:false,maximumBytesBilled:String(c.maximumBytesBilled),parameterMode:"NAMED",queryParameters:[
          {name:"owner",parameterType:{type:"STRING"},parameterValue:{value:ownerId}},
          {name:"since",parameterType:{type:"TIMESTAMP"},parameterValue:{value:new Date(start).toISOString()}}]}}});
      return {id,state:"submitted"};
    } catch {
      // jobs.insert uses the reserved job ID. Never allocate a new potentially billable job after an uncertain response.
      try {await this.readback(ownerId,id);return {id,state:"submitted"};}catch {return {id,state:"uncertain"};}
    }
  }
  async readback(ownerId:string,id:string):Promise<Record<string,unknown>> {
    const row=(await this.pool.query("SELECT remote_job_id,location,project_id FROM omni_chat.analytics_queries WHERE owner_id=$1 AND id=$2",[ownerId,id])).rows[0];
    if(!row) throw new ChatNotFound("analytics query not found");
    if(!/^oa_[a-f0-9]{32}$/.test(row.remote_job_id)||!this.config||row.location!==this.config.location||row.project_id!==this.config.project) throw new Error("invalid analytics checkpoint");
    const result=await this.call(`queries/${row.remote_job_id}?location=${encodeURIComponent(row.location)}&maxResults=1000&timeoutMs=1000`);
    if(result.errors) throw new Error("analytics query failed");
    return {id,complete:result.jobComplete===true,schema:result.schema,rows:result.rows??[],totalRows:result.totalRows};
  }
}
async function readBoundedResponse(response:Response,max:number):Promise<string> {
  if(!response.body) throw new Error("empty analytics response");
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {for(;;) {const {done,value}=await reader.read();if(done) break;size+=value.length;if(size>max) throw new Error("analytics response exceeds bound");chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(chunks).toString("utf8");
}
