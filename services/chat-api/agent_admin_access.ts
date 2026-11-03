import {parseModelEntitlements,type ModelRuntime} from "./model_entitlements.js";
import type {AdminReader} from "./agent_admin_settings.js";

export type AgentAccessModel={runtime:ModelRuntime;model:string;routeProfile?:"private-lite"|"advanced-flash"};
export type AgentAccessOwner={ownerId:string;models:AgentAccessModel[];tools:string[]};
export type AgentAccessDraft={version:number;owners:AgentAccessOwner[];updatedAt:string|null};
export class AgentAccessConflict extends Error{constructor(){super("agent_admin_access_version_conflict");}}
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const secret=(v:string)=>/^(?:AIza|sk-|gsk_|ya29\.|Bearer\b)/i.test(v);
const object=(v:unknown):Record<string,unknown>=>{
  if(!v||typeof v!=="object"||Array.isArray(v))throw new SyntaxError("invalid_agent_access");
  return v as Record<string,unknown>;
};
export function validateAgentAccess(value:unknown):AgentAccessOwner[]{
  if(!Array.isArray(value)||value.length>100)throw new SyntaxError("invalid_agent_access_owners");
  const owners=new Set<string>();
  return value.map(input=>{
    const row=object(input);
    if(Object.keys(row).sort().join(",")!=="models,ownerId,tools"||typeof row.ownerId!=="string"||
      !UUID.test(row.ownerId)||!Array.isArray(row.models)||row.models.length>32||
      !Array.isArray(row.tools)||row.tools.length>128)throw new SyntaxError("invalid_agent_access_owner");
    const ownerId=row.ownerId.toLowerCase();
    if(owners.has(ownerId))throw new SyntaxError("duplicate_agent_access_owner");owners.add(ownerId);
    const models:AgentAccessModel[]=row.models.map(input=>{
      const m=object(input);
      if(Object.keys(m).sort().join(",")!==(m.routeProfile===undefined?"model,runtime":"model,routeProfile,runtime")||
        typeof m.model!=="string"||secret(m.model))throw new SyntaxError("invalid_agent_access_model");
      if(m.routeProfile==="advanced-flash"&&(!/^gemini-[a-z0-9.-]+-flash(?:-[a-z0-9.-]+)?$/.test(m.model)||
        m.model.includes("flash-lite")))throw new SyntaxError("invalid_agent_access_paid_model");
      return {runtime:m.runtime as ModelRuntime,model:m.model,
        ...(m.routeProfile===undefined?{}:{routeProfile:m.routeProfile as "private-lite"|"advanced-flash"})};
    });
    // Validation uses existing platform-model policy; this draft never becomes its live allowlist.
    if(models.length)parseModelEntitlements(JSON.stringify(models.map(m=>({...m,ownerId,credentialMode:"platform"}))),
      [ownerId],{enabled:true,models:models.filter(m=>m.routeProfile).map(m=>m.model)});
    const tools:string[]=row.tools.map(t=>{
      if(typeof t!=="string"||!/^[a-z][a-z0-9_.-]{1,127}$/.test(t)||secret(t))
        throw new SyntaxError("invalid_agent_access_tool");return t;
    });
    if(new Set(tools).size!==tools.length)throw new SyntaxError("duplicate_agent_access_tool");
    return {ownerId,models,tools};
  });
}
const SAVE_SQL=`WITH saved AS (
  INSERT INTO omni_chat.agent_admin_access(singleton,version,owners,updated_by,updated_at)
    SELECT 'global',1,$2::jsonb,$3::uuid,now()
    WHERE $1::integer=0 OR EXISTS(SELECT 1 FROM omni_chat.agent_admin_access WHERE singleton='global')
  ON CONFLICT(singleton) DO UPDATE SET version=omni_chat.agent_admin_access.version+1,
    owners=excluded.owners,updated_by=excluded.updated_by,updated_at=now()
  WHERE omni_chat.agent_admin_access.version=$1::integer
  RETURNING version,owners,updated_at
), audit AS (
  INSERT INTO omni_chat.agent_admin_access_audit(version,owners,updated_by,updated_at)
  SELECT version,owners,$3::uuid,updated_at FROM saved RETURNING version
) SELECT saved.version,saved.owners,saved.updated_at FROM saved JOIN audit USING(version)`;
function draft(row:Record<string,unknown>|undefined):AgentAccessDraft{
  if(!row)return {version:0,owners:[],updatedAt:null};
  const version=Number(row.version);
  const date=row.updated_at instanceof Date?row.updated_at:new Date(String(row.updated_at));
  if(!Number.isSafeInteger(version)||version<1||!Number.isFinite(date.getTime()))throw Error("invalid_agent_access_readback");
  return {version,owners:validateAgentAccess(row.owners),updatedAt:date.toISOString()};
}
/** DRAFT ONLY. Server must enforce verified OAuth Admin before calling this store. */
export class AgentAdminAccessStore{
  constructor(private readonly db:AdminReader){}
  async read():Promise<AgentAccessDraft>{
    return draft((await this.db.query("SELECT version,owners,updated_at FROM omni_chat.agent_admin_access WHERE singleton='global'")).rows[0]);
  }
  async save(ownerId:string,expectedVersion:unknown,owners:unknown):Promise<AgentAccessDraft>{
    if(!UUID.test(ownerId)||typeof expectedVersion!=="number"||!Number.isSafeInteger(expectedVersion)||
      expectedVersion<0||expectedVersion>=2147483647)throw new SyntaxError("invalid_agent_access_version");
    const checked=validateAgentAccess(owners);
    const row=(await this.db.query(SAVE_SQL,[expectedVersion,JSON.stringify(checked),ownerId.toLowerCase()])).rows[0];
    if(!row)throw new AgentAccessConflict();return draft(row);
  }
}
