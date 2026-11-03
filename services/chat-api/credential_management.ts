import { randomUUID,createHash } from "node:crypto";
import type { Pool } from "pg";
import { ChatConflict, ChatNotFound } from "./storage.js";
import type { ByokProvider, SecretVault } from "./credential_vault.js";

export type CredentialStatus = "PENDING" | "ACTIVE" | "REVOKING" | "REVOKED";
export type CredentialPublic = { profile_id: string; provider: ByokProvider; status: CredentialStatus; created_at: string };
export type CredentialRecord = CredentialPublic & { secret_version: string };
export type RotationStatus="RESERVED"|"PROVISIONING"|"VERIFIED"|"CLEANUP"|"COMPLETED"|"UNKNOWN"|"ROLLBACK"|"ROLLED_BACK";
export type RotationPublic={operation_id:string;profile_id:string;status:RotationStatus;updated_at:string};
type Rotation=RotationPublic&{owner_id:string;resource_id:string;old_reference:string;new_reference:string;
 key_sha256:string;fence:number};
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function keyDigest(value:string){return createHash("sha256").update(value).digest("hex");}
function publicRotation(r:Rotation):RotationPublic{return {operation_id:r.operation_id,profile_id:r.profile_id,
 status:r.status,updated_at:r.updated_at};}
function validKey(value:string){
 if(typeof value!=="string"||Buffer.byteLength(value)<16||Buffer.byteLength(value)>4096||
  value.trim()!==value||/[\r\n\0]/.test(value))throw new Error("BYOK value invalid");
}

export class CredentialRegistry {
  constructor(private readonly pool: Pool) {}

  async reserve(ownerId: string, profileId: string, provider: ByokProvider, secretVersion: string): Promise<void> {
    await this.pool.query(`INSERT INTO omni_chat.credential_profiles
       (owner_id,profile_id,provider,secret_version,status)
       VALUES($1,$2,$3,$4,'PENDING')`,
      [ownerId,profileId,provider,secretVersion]);
  }

  async activate(ownerId: string, profileId: string): Promise<CredentialPublic> {
    const rows = (await this.pool.query(
      `UPDATE omni_chat.credential_profiles SET status='ACTIVE',updated_at=now()
       WHERE owner_id=$1 AND profile_id=$2 AND status='PENDING'
       RETURNING profile_id,provider,status,created_at`,[ownerId,profileId])).rows;
    if (rows.length !== 1) throw new ChatConflict("BYOK state transition conflict");
    return rows[0] as CredentialPublic;
  }

  async list(ownerId: string): Promise<CredentialPublic[]> {
    return (await this.pool.query(
      `SELECT profile_id,provider,status,created_at FROM omni_chat.credential_profiles
       WHERE owner_id=$1 ORDER BY created_at,profile_id LIMIT 100`,[ownerId])).rows as CredentialPublic[];
  }

  async beginRevoke(ownerId: string, profileId: string): Promise<CredentialRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query(
        `SELECT profile_id,provider,status,secret_version,created_at
         FROM omni_chat.credential_profiles
         WHERE owner_id=$1 AND profile_id=$2 FOR UPDATE`,
        [ownerId,profileId])).rows[0] as CredentialRecord | undefined;
      if (!row) throw new ChatNotFound("BYOK profile unavailable");
      if (row.status === "ACTIVE" || row.status === "PENDING") {
        await client.query(
          `UPDATE omni_chat.credential_profiles SET status='REVOKING',updated_at=now()
           WHERE owner_id=$1 AND profile_id=$2`,[ownerId,profileId]);
      }
      await client.query("COMMIT");
      return { ...row,status:row.status === "REVOKED" ? "REVOKED" : "REVOKING" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async finalizeRevoke(ownerId: string, profileId: string): Promise<CredentialPublic> {
    const row = (await this.pool.query(
      `UPDATE omni_chat.credential_profiles SET status='REVOKED',updated_at=now()
       WHERE owner_id=$1 AND profile_id=$2 AND status IN ('REVOKING','REVOKED')
       RETURNING profile_id,provider,status,created_at`,[ownerId,profileId])).rows[0];
    if (!row) throw new ChatConflict("BYOK revocation state conflict");
    return row as CredentialPublic;
  }

  // Internal-only non-secret locator, never returned by /v1/credentials.
  async resolveRef(ownerId: string, provider: ByokProvider, profileId: string): Promise<string> {
    const row = (await this.pool.query(
      `SELECT secret_version FROM omni_chat.credential_profiles
       WHERE owner_id=$1 AND profile_id=$2 AND provider=$3 AND status='ACTIVE'`,
      [ownerId,profileId,provider])).rows[0];
    if (!row) throw new ChatNotFound("BYOK credential unavailable");
    return String(row.secret_version);
  }

  async resolveExecution(ownerId:string,threadId:string,turnId:string,provider:ByokProvider,profileId:string):Promise<string>{
    const row=(await this.pool.query(`SELECT cp.secret_version FROM omni_chat.credential_profiles cp
      JOIN omni_chat.threads th ON th.owner_id=cp.owner_id AND th.credential_profile_id=cp.profile_id
      JOIN omni_chat.turns t ON t.owner_id=th.owner_id AND t.thread_id=th.thread_id
      WHERE cp.owner_id=$1 AND th.thread_id=$2 AND t.turn_id=$3 AND t.status='RUNNING'
        AND th.runtime=$4 AND cp.provider=$4 AND cp.profile_id=$5 AND cp.status='ACTIVE'`,
      [ownerId,threadId,turnId,provider,profileId])).rows[0];
    if(!row)throw new ChatNotFound("BYOK execution unavailable");
    return String(row.secret_version);
  }

  async reserveRotation(ownerId:string,profileId:string,operationKey:string,digest:string,
    reference:(resourceId:string)=>string):Promise<Rotation>{
    if(!UUID.test(ownerId)||!UUID.test(profileId)||!UUID.test(operationKey))throw new SyntaxError("invalid BYOK operation identifier");
    const client=await this.pool.connect();
    try{
      await client.query("BEGIN");
      const profile=(await client.query(`SELECT secret_version FROM omni_chat.credential_profiles
       WHERE owner_id=$1 AND profile_id=$2 AND status='ACTIVE' FOR UPDATE`,[ownerId,profileId])).rows[0];
      if(!profile)throw new ChatNotFound("BYOK active profile unavailable");
      const existing=(await client.query(`SELECT * FROM omni_chat.credential_rotations
       WHERE owner_id=$1 AND operation_key=$2`,[ownerId,operationKey])).rows[0] as Rotation|undefined;
      if(existing){
        if(existing.profile_id!==profileId||existing.key_sha256!==digest)throw new ChatConflict("BYOK operation intent conflict");
        await client.query("COMMIT");return existing;
      }
      const active=(await client.query(`SELECT 1 FROM omni_chat.credential_rotations WHERE owner_id=$1
       AND profile_id=$2 AND status NOT IN ('COMPLETED','ROLLED_BACK')`,[ownerId,profileId])).rows;
      if(active.length)throw new ChatConflict("BYOK replacement already pending");
      const resourceId=randomUUID();
      const row=(await client.query(`INSERT INTO omni_chat.credential_rotations
       (owner_id,operation_id,operation_key,profile_id,resource_id,old_reference,new_reference,key_sha256,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'RESERVED') RETURNING *`,
       [ownerId,randomUUID(),operationKey,profileId,resourceId,profile.secret_version,reference(resourceId),digest])).rows[0] as Rotation;
      await client.query("COMMIT");return row;
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
  async rotation(ownerId:string,operationId:string):Promise<Rotation>{
    if(!UUID.test(ownerId)||!UUID.test(operationId))throw new SyntaxError("invalid BYOK operation identifier");
    const row=(await this.pool.query("SELECT * FROM omni_chat.credential_rotations WHERE owner_id=$1 AND operation_id=$2",
      [ownerId,operationId])).rows[0] as Rotation|undefined;
    if(!row)throw new ChatNotFound("BYOK operation unavailable");return row;
  }
  async rotations(ownerId:string):Promise<RotationPublic[]>{
    if(!UUID.test(ownerId))throw new SyntaxError("invalid BYOK owner identifier");
    return (await this.pool.query(`SELECT operation_id,profile_id,status,updated_at
      FROM omni_chat.credential_rotations WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,[ownerId])).rows as RotationPublic[];
  }
  async claimRotation(r:Rotation,create:boolean):Promise<Rotation|null>{
    const row=(await this.pool.query(`UPDATE omni_chat.credential_rotations SET fence=fence+1,
      lease_until=now()+interval '90 seconds',status=CASE WHEN status='RESERVED' THEN 'PROVISIONING' ELSE status END,updated_at=now()
      WHERE owner_id=$1 AND operation_id=$2 AND (lease_until IS NULL OR lease_until<=now())
      AND status=ANY($3::text[]) RETURNING *`,[r.owner_id,r.operation_id,create?["RESERVED"]:
      ["PROVISIONING","UNKNOWN","VERIFIED","CLEANUP","ROLLBACK"]])).rows[0];
    return row?{...row,fence:Number(row.fence)} as Rotation:null;
  }
  async rotationState(r:Rotation,status:RotationStatus,release=false):Promise<Rotation>{
    const row=(await this.pool.query(`UPDATE omni_chat.credential_rotations SET status=$4,updated_at=now(),
      lease_until=CASE WHEN $5 THEN NULL ELSE lease_until END WHERE owner_id=$1 AND operation_id=$2 AND fence=$3
      AND lease_until>now() RETURNING *`,[r.owner_id,r.operation_id,r.fence,status,release])).rows[0];
    if(!row)throw new ChatConflict("BYOK operation lease lost");return {...row,fence:Number(row.fence)} as Rotation;
  }
  async switchRotation(r:Rotation):Promise<Rotation>{
    const client=await this.pool.connect();
    try{
      await client.query("BEGIN");
      await client.query("SELECT 1 FROM omni_chat.credential_profiles WHERE owner_id=$1 AND profile_id=$2 FOR UPDATE",[r.owner_id,r.profile_id]);
      const locked=(await client.query(`SELECT 1 FROM omni_chat.credential_rotations WHERE owner_id=$1 AND operation_id=$2
       AND fence=$3 AND status='VERIFIED' AND lease_until>now() FOR UPDATE`,[r.owner_id,r.operation_id,r.fence])).rows;
      if(!locked.length)throw new ChatConflict("BYOK operation lease lost");
      const switched=(await client.query(`UPDATE omni_chat.credential_profiles SET secret_version=$4,updated_at=now()
       WHERE owner_id=$1 AND profile_id=$2 AND status='ACTIVE' AND secret_version=$3 RETURNING profile_id`,
       [r.owner_id,r.profile_id,r.old_reference,r.new_reference])).rows;
      const row=(await client.query(`UPDATE omni_chat.credential_rotations SET status=$3,updated_at=now()
       WHERE owner_id=$1 AND operation_id=$2 RETURNING *`,[r.owner_id,r.operation_id,switched.length?"CLEANUP":"ROLLBACK"])).rows[0] as Rotation;
      await client.query("COMMIT");return {...row,fence:Number(row.fence)};
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
}

export class CredentialManager {
  constructor(private readonly registry: CredentialRegistry,
              private readonly vault: SecretVault) {}

  async create(ownerId: string, provider: ByokProvider, value: string): Promise<CredentialPublic> {
    if (!["gemini","openrouter","groq"].includes(provider)) throw new Error("BYOK provider invalid");
    if (typeof value !== "string" || value.length < 16 || value.length > 4096 ||
        value.trim() !== value || /[\r\n\0]/.test(value))
      throw new Error("BYOK value invalid");
    const profileId = randomUUID();
    const reference = this.vault.reference(profileId);
    // Reserve first: a crash cannot lose the expected server-generated Secret
    // locator. PENDING rows are never usable for inference.
    await this.registry.reserve(ownerId,profileId,provider,reference);
    try {
      const created = await this.vault.create(profileId,value);
      if (created !== reference) throw new Error("BYOK vault version mismatch");
      if(this.vault.access&&keyDigest(await this.vault.access(reference))!==keyDigest(value))
        throw new Error("BYOK vault readback mismatch");
      return await this.registry.activate(ownerId,profileId);
    } catch {
      // PENDING remains non-executable and auditable for recovery. The app
      // must not silently reuse or infer success after an uncertain write.
      throw new Error("BYOK provisioning requires reconciliation");
    }
  }

  list(ownerId: string): Promise<CredentialPublic[]> { return this.registry.list(ownerId); }
  rotations(ownerId:string):Promise<RotationPublic[]>{return this.registry.rotations(ownerId);}

  resolveExecution(ownerId:string,threadId:string,turnId:string,provider:ByokProvider,profileId:string){
    return this.registry.resolveExecution(ownerId,threadId,turnId,provider,profileId);
  }

  async revoke(ownerId: string, profileId: string): Promise<CredentialPublic> {
    const row = await this.registry.beginRevoke(ownerId,profileId);
    if (row.status === "REVOKED") {
      return { profile_id:row.profile_id,provider:row.provider,status:"REVOKED",
        created_at:row.created_at };
    }
    // Denial becomes durable BEFORE external revocation. An API failure
    // leaves REVOKING (not usable), and can be retried safely by an operator.
    await this.vault.disable(row.secret_version);
    return this.registry.finalizeRevoke(ownerId,profileId);
  }

  async replace(ownerId:string,profileId:string,key:string,operationKey:string):Promise<RotationPublic>{
    validKey(key);
    if(!this.vault.access)throw new Error("BYOK verified readback unavailable");
    const reserved=await this.registry.reserveRotation(ownerId,profileId,operationKey,keyDigest(key),id=>this.vault.reference(id));
    if(reserved.status!=="RESERVED")return publicRotation(reserved);
    const claimed=await this.registry.claimRotation(reserved,true);
    if(!claimed)return publicRotation(await this.registry.rotation(ownerId,reserved.operation_id));
    try{
      const reference=await this.vault.create(claimed.resource_id,key);
      if(reference!==claimed.new_reference)throw new Error("BYOK replacement resource mismatch");
      return publicRotation(await this.finishRotation(claimed));
    }catch{
      await this.releaseRotation(claimed).catch(()=>undefined);
      return publicRotation(await this.registry.rotation(ownerId,claimed.operation_id));
    }
  }

  async reconcile(ownerId:string,operationId:string):Promise<RotationPublic>{
    if(!this.vault.access)throw new Error("BYOK verified readback unavailable");
    const existing=await this.registry.rotation(ownerId,operationId);
    const claimed=await this.registry.claimRotation(existing,false);
    if(!claimed)return publicRotation(existing);
    try{return publicRotation(await this.finishRotation(claimed));}
    catch{
      await this.releaseRotation(claimed).catch(()=>undefined);
      return publicRotation(await this.registry.rotation(ownerId,operationId));
    }
  }

  private async releaseRotation(claimed:Rotation){
    // Read durable state after an uncertain SQL commit; never turn a switched key into a rollback candidate.
    const current=await this.registry.rotation(claimed.owner_id,claimed.operation_id);
    if(["COMPLETED","ROLLED_BACK"].includes(current.status))return;
    await this.registry.rotationState(claimed,["CLEANUP","ROLLBACK"].includes(current.status)?current.status:"UNKNOWN",true);
  }

  private async finishRotation(operation:Rotation):Promise<Rotation>{
    let r=operation;
    if(!["CLEANUP","ROLLBACK"].includes(r.status)){
      if(this.vault.inspect&&await this.vault.inspect(r.new_reference)!=="enabled"){
        r=await this.registry.rotationState(r,"ROLLBACK");
      }else{
      const observed=await this.vault.access!(r.new_reference);
      if(keyDigest(observed)!==r.key_sha256){
        r=await this.registry.rotationState(r,"ROLLBACK");
      }else{
        r=await this.registry.rotationState(r,"VERIFIED");
        r=await this.registry.switchRotation(r);
      }
      }
    }
    if(r.status==="CLEANUP"){
      // The active reference has already switched atomically to verified new bytes.
      if(operation.status==="CLEANUP"&&keyDigest(await this.vault.access!(r.new_reference))!==r.key_sha256)
        throw new Error("BYOK replacement readback unavailable");
      if(!this.vault.inspect||await this.vault.inspect(r.old_reference)==="enabled")
        await this.vault.disable(r.old_reference);
      return this.registry.rotationState(r,"COMPLETED",true);
    }
    if(r.status==="ROLLBACK"){
      if(this.vault.discard)await this.vault.discard(r.new_reference);
      else await this.vault.disable(r.new_reference);
      return this.registry.rotationState(r,"ROLLED_BACK",true);
    }
    return r;
  }
}
