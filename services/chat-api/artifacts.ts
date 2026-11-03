import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { GoogleAuth } from "google-auth-library";
import { ChatConflict, ChatNotFound } from "./storage.js";

const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const MAX_ARTIFACT_BYTES=16_777_216;
export type ArtifactLimits={maxOwnerBytes:number;maxGlobalBytes:number;maxOwnerObjects:number;maxGlobalObjects:number};
export function parseArtifactLimits(raw:string):ArtifactLimits {
  if(typeof raw!=="string"||raw.length>4096) throw new Error("artifact storage limits required");
  let value:ArtifactLimits;try {value=JSON.parse(raw);}catch {throw new Error("invalid artifact storage limits");}
  const keys=["maxOwnerBytes","maxGlobalBytes","maxOwnerObjects","maxGlobalObjects"];
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==keys.length||
    keys.some(key=>!Object.hasOwn(value,key)||!Number.isSafeInteger(value[key as keyof ArtifactLimits])||value[key as keyof ArtifactLimits]<1)||
    value.maxOwnerBytes>value.maxGlobalBytes||value.maxOwnerObjects>value.maxGlobalObjects) throw new Error("invalid artifact storage limits");
  return value;
}
export type ArtifactInput={idempotencyKey:string;sha256:string;byteLength:number;contentType:string};
export type ArtifactRow={id:string;owner_id:string;object_key:string;sha256:string;byte_length:string;
  content_type:string;state:string;generation:string|null};
export interface ArtifactObjects {
  put(key:string,bytes:Buffer,contentType:string):Promise<void>;
  get(key:string,generation?:string):Promise<{bytes:Buffer;generation:string}|null>;
}
export function validateArtifactInput(value:ArtifactInput):void {
  if(!value || typeof value.idempotencyKey!=="string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.idempotencyKey) ||
    !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.byteLength) ||
    value.byteLength<0 || value.byteLength>MAX_ARTIFACT_BYTES ||
    typeof value.contentType!=="string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value.contentType))
    throw new SyntaxError("invalid artifact metadata");
}
function identity(owner:string,id?:string):void {
  if(!UUID.test(owner) || (id!==undefined&&!UUID.test(id))) throw new SyntaxError("invalid artifact identity");
}

// GCS stays behind the application boundary; object names and credentials never reach browsers.
export class GcsArtifactObjects implements ArtifactObjects {
  constructor(private readonly bucket:string,private readonly auth=new GoogleAuth({scopes:["https://www.googleapis.com/auth/devstorage.read_write"]}),
    private readonly request:typeof fetch=fetch) {
    if(!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket) || bucket.includes("..")) throw new Error("invalid artifact bucket");
  }
  private async headers():Promise<Record<string,string>> {
    const token=await this.auth.getAccessToken();
    if(!token) throw new Error("artifact service identity unavailable");
    return {Authorization:`Bearer ${token}`};
  }
  private key(key:string):string {
    if(!/^owners\/[0-9a-f-]{36}\/artifacts\/[0-9a-f-]{36}$/i.test(key)) throw new Error("invalid object scope");
    return encodeURIComponent(key);
  }
  async put(key:string,bytes:Buffer,contentType:string):Promise<void> {
    if(bytes.length>MAX_ARTIFACT_BYTES) throw new Error("artifact too large");
    const response=await this.request(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&ifGenerationMatch=0&name=${this.key(key)}`,
      {method:"POST",headers:{...await this.headers(),"Content-Type":contentType},body:new Uint8Array(bytes),signal:AbortSignal.timeout(30_000),redirect:"error"});
    if(!response.ok && response.status!==412) throw new Error("artifact upload outcome requires reconciliation");
    await response.body?.cancel();
  }
  async get(key:string,generation?:string):Promise<{bytes:Buffer;generation:string}|null> {
    if(generation!==undefined&&!/^[0-9]{1,30}$/.test(generation)) throw new Error("invalid object generation");
    const base=`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${this.key(key)}`;
    const headers=await this.headers();
    const metadata=await this.request(base+(generation?`?generation=${generation}`:""),{headers,signal:AbortSignal.timeout(15_000),redirect:"error"});
    if(metadata.status===404) return null;
    if(!metadata.ok) throw new Error("artifact lookup unavailable");
    const meta=await metadata.json() as {generation?:string;size?:string};
    if(!meta.generation || !/^[0-9]{1,30}$/.test(meta.generation) || (generation!==undefined&&generation!==meta.generation) || !/^[0-9]+$/.test(meta.size??"") || Number(meta.size)>MAX_ARTIFACT_BYTES)
      throw new Error("invalid object metadata");
    const response=await this.request(base+`?alt=media&generation=${meta.generation}`,{headers,signal:AbortSignal.timeout(30_000),redirect:"error"});
    if(!response.ok || !response.body) throw new Error("artifact download unavailable");
    const chunks:Uint8Array[]=[];let length=0;
    for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      length+=chunk.length;
      if(length>MAX_ARTIFACT_BYTES) {await response.body.cancel().catch(()=>{});throw new Error("artifact too large");}
      chunks.push(chunk);
    }
    if(length!==Number(meta.size)) throw new Error("artifact length mismatch");
    return {bytes:Buffer.concat(chunks),generation:meta.generation};
  }
}

export class ArtifactService {
  async list(ownerId:string):Promise<Record<string,unknown>[]>{
    identity(ownerId);
    return (await this.pool.query(`SELECT id,state,sha256,byte_length,content_type,created_at,updated_at
      FROM omni_chat.artifacts WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,[ownerId])).rows;
  }
  constructor(private readonly pool:Pool,private readonly objects:ArtifactObjects,private readonly secret:string,private readonly limits?:ArtifactLimits) {
    if(Buffer.byteLength(secret)<32) throw new Error("artifact signing secret must contain at least 32 bytes");
    if(limits) this.limits=Object.freeze(parseArtifactLimits(JSON.stringify(limits)));
  }
  async reserve(ownerId:string,input:ArtifactInput):Promise<Record<string,unknown>> {
    identity(ownerId);validateArtifactInput(input);
    const client=this.limits?await this.pool.connect():undefined;
    try {
    if(client) {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('omniagent-artifact-quota',0))");
      const previous=(await client.query<ArtifactRow>("SELECT * FROM omni_chat.artifacts WHERE owner_id=$1 AND idempotency_key=$2",[ownerId,input.idempotencyKey])).rows[0];
      if(previous) {
        const result=this.reservation(previous,input);await client.query("COMMIT");return result;
      }
      const usage=(await client.query(`SELECT coalesce(sum(byte_length) FILTER(WHERE owner_id=$1),0)::text AS owner_bytes,
        coalesce(sum(byte_length),0)::text AS global_bytes,count(*) FILTER(WHERE owner_id=$1)::text AS owner_objects,count(*)::text AS global_objects
        FROM omni_chat.artifacts`,[ownerId])).rows[0];
      const n=(key:string)=>{if(!/^[0-9]+$/.test(String(usage?.[key])))throw new Error("artifact quota ledger unavailable");return BigInt(usage[key]);};
      if(n("owner_bytes")+BigInt(input.byteLength)>BigInt(this.limits!.maxOwnerBytes)||n("global_bytes")+BigInt(input.byteLength)>BigInt(this.limits!.maxGlobalBytes)||
        n("owner_objects")+1n>BigInt(this.limits!.maxOwnerObjects)||n("global_objects")+1n>BigInt(this.limits!.maxGlobalObjects)) throw new ChatConflict("artifact storage budget exhausted");
    }
    const id=randomUUID();
    const result=await (client??this.pool).query<ArtifactRow>(`INSERT INTO omni_chat.artifacts
      (id,owner_id,idempotency_key,object_key,sha256,byte_length,content_type,state) VALUES($1,$2,$3,$4,$5,$6,$7,'reserved')
      ON CONFLICT(owner_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING *`,
      [id,ownerId,input.idempotencyKey,`owners/${ownerId}/artifacts/${id}`,input.sha256,input.byteLength,input.contentType]);
    const reserved=this.reservation(result.rows[0],input);
    if(client)await client.query("COMMIT");return reserved;
    } catch(error) {if(client)await client.query("ROLLBACK").catch(()=>{});throw error;}
    finally {client?.release();}
  }
  private reservation(row:ArtifactRow,input:ArtifactInput):Record<string,unknown> {
    if(row.sha256!==input.sha256 || Number(row.byte_length)!==input.byteLength || row.content_type!==input.contentType)
      throw new ChatConflict("artifact idempotency conflict");
    return {id:row.id,state:row.state,sha256:row.sha256,byteLength:Number(row.byte_length),contentType:row.content_type};
  }
  async metadata(ownerId:string,id:string):Promise<ArtifactRow> {
    identity(ownerId,id);
    const row=(await this.pool.query<ArtifactRow>("SELECT * FROM omni_chat.artifacts WHERE owner_id=$1 AND id=$2",[ownerId,id])).rows[0];
    if(!row) throw new ChatNotFound("artifact not found");return row;
  }
  async signedAccess(ownerId:string,id:string,operation:"upload"|"download"):Promise<{path:string;token:string;expiresAt:number}> {
    const row=await this.metadata(ownerId,id);
    if(operation!=="upload"&&operation!=="download") throw new SyntaxError("invalid artifact operation");
    if(operation==="download"&&row.state!=="available") throw new ChatConflict("artifact unavailable");
    const expiresAt=Math.floor(Date.now()/1000)+300;
    const payload=Buffer.from(JSON.stringify({ownerId,id,operation,expiresAt})).toString("base64url");
    return {path:`/v1/artifacts/${id}/${operation}`,token:payload+"."+createHmac("sha256",this.secret).update(payload).digest("base64url"),expiresAt};
  }
  private verify(ownerId:string,id:string,operation:string,token:string):void {
    identity(ownerId,id);
    if(typeof token!=="string"||token.length>1024) throw new ChatNotFound("artifact access denied");
    const [payload,signature,...extra]=token.split(".");
    const expected=createHmac("sha256",this.secret).update(payload??"").digest();
    const actual=Buffer.from(signature??"","base64url");
    if(extra.length||actual.length!==expected.length||!timingSafeEqual(expected,actual)) throw new ChatNotFound("artifact access denied");
    let value:Record<string,unknown>;
    try {value=JSON.parse(Buffer.from(payload,"base64url").toString());} catch {throw new ChatNotFound("artifact access denied");}
    if(!value || typeof value!=="object" || Array.isArray(value) || value.ownerId!==ownerId || value.id!==id || value.operation!==operation || typeof value.expiresAt!=="number" ||
      value.expiresAt<Math.floor(Date.now()/1000) || value.expiresAt>Math.floor(Date.now()/1000)+300) throw new ChatNotFound("artifact access denied");
  }
  async upload(ownerId:string,id:string,token:string,bytes:Buffer):Promise<{state:string}> {
    this.verify(ownerId,id,"upload",token);
    const row=await this.metadata(ownerId,id);
    if(bytes.length!==Number(row.byte_length) || createHash("sha256").update(bytes).digest("hex")!==row.sha256) throw new SyntaxError("artifact digest or length mismatch");
    if(row.state==="available") return {state:"available"};
    await this.pool.query("UPDATE omni_chat.artifacts SET state='uploading',updated_at=now() WHERE owner_id=$1 AND id=$2 AND state<>'available'",[ownerId,id]);
    try {await this.objects.put(row.object_key,bytes,row.content_type);return await this.reconcile(ownerId,id);}
    catch {await this.pool.query("UPDATE omni_chat.artifacts SET state='uncertain',updated_at=now() WHERE owner_id=$1 AND id=$2 AND state<>'available'",[ownerId,id]);throw new ChatConflict("artifact upload uncertain; reconcile before retry");}
  }
  async reconcile(ownerId:string,id:string):Promise<{state:string}> {
    const row=await this.metadata(ownerId,id);
    const object=await this.objects.get(row.object_key,row.generation??undefined);
    if(!object) return {state:row.state};
    const valid=object.bytes.length===Number(row.byte_length)&&createHash("sha256").update(object.bytes).digest("hex")===row.sha256;
    await this.pool.query("UPDATE omni_chat.artifacts SET state=$3,generation=$4,updated_at=now() WHERE owner_id=$1 AND id=$2",[ownerId,id,valid?"available":"rejected",object.generation]);
    return {state:valid?"available":"rejected"};
  }
  async readVerified(ownerId:string,id:string):Promise<{bytes:Buffer;contentType:string;sha256:string}> {
    const row=await this.metadata(ownerId,id);
    if(row.state!=="available" || !row.generation) throw new ChatConflict("artifact unavailable");
    const object=await this.objects.get(row.object_key,row.generation);
    if(!object || object.bytes.length!==Number(row.byte_length)||createHash("sha256").update(object.bytes).digest("hex")!==row.sha256) throw new ChatConflict("artifact integrity check failed");
    return {bytes:object.bytes,contentType:row.content_type,sha256:row.sha256};
  }
  async download(ownerId:string,id:string,token:string):Promise<{bytes:Buffer;contentType:string;sha256:string}> {
    this.verify(ownerId,id,"download",token);return this.readVerified(ownerId,id);
  }
}
