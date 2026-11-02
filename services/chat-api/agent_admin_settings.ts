/**
 * Owner-authorized Admin draft, deliberately NOT wired to model execution.
 * No secret bytes, vault paths, identity tokens or provider responses accepted.
 */
export type AgentSettings = {
  models: { publicLite:string; privateLite:string; advancedFlash:string };
  limits: { ownerDailyCalls:number; globalDailyCalls:number; ownerDailyTokens:number;
    globalDailyTokens:number; monthlyBudgetUsdCents:number };
  agent: { maxSteps:number; maxToolCalls:number; timeoutSeconds:number; maxToolOutputBytes:number };
  controls: { requestPaidRouting:boolean; requestAgentExecution:boolean;
    requireWriteApproval:boolean };
  tools: { life:boolean; janus:boolean; calendar:boolean; drive:boolean };
};

export const DEFAULT_AGENT_SETTINGS:AgentSettings = {
  models:{publicLite:"gemini-3.5-flash-lite",privateLite:"gemini-3.5-flash-lite",
    advancedFlash:"gemini-3.8-flash"},
  limits:{ownerDailyCalls:20,globalDailyCalls:100,ownerDailyTokens:100000,
    globalDailyTokens:500000,monthlyBudgetUsdCents:1000},
  agent:{maxSteps:4,maxToolCalls:8,timeoutSeconds:90,maxToolOutputBytes:16384},
  controls:{requestPaidRouting:false,requestAgentExecution:false,requireWriteApproval:true},
  tools:{life:false,janus:false,calendar:false,drive:false}
};

export class AgentSettingsConflict extends Error {
  constructor(){super("agent_admin_settings_version_conflict");}
}
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function parseAgentAdmins(raw:string):ReadonlySet<string>{
  const ids=raw.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(ids.length<1||ids.length>20||ids.some(s=>!UUID.test(s))||new Set(ids).size!==ids.length)
    throw new Error("agent_admin_owner_configuration_invalid");
  return new Set(ids);
}
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new SyntaxError("invalid_agent_settings");
  return value as Record<string,unknown>;
}
function exact(record:Record<string,unknown>,keys:readonly string[]):void{
  if(Object.keys(record).sort().join("|")!==[...keys].sort().join("|"))
    throw new SyntaxError("invalid_agent_settings_fields");
}
function number(value:unknown,min:number,max:number):number{
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<min||value>max)
    throw new SyntaxError("invalid_agent_settings_limit");
  return value;
}
function bool(value:unknown):boolean{
  if(typeof value!=="boolean")throw new SyntaxError("invalid_agent_settings_toggle");
  return value;
}
function lite(value:unknown):string{
  if(typeof value!=="string"||![
    "gemini-3.5-flash-lite","gemini-3.1-flash-lite","gemini-2.5-flash-lite"
  ].includes(value))throw new SyntaxError("invalid_agent_settings_lite_model");
  return value;
}
export function validateAgentSettings(value:unknown):AgentSettings{
  const x=object(value);
  exact(x,["models","limits","agent","controls","tools"]);
  const models=object(x.models),limits=object(x.limits),agent=object(x.agent);
  const controls=object(x.controls),tools=object(x.tools);
  exact(models,["publicLite","privateLite","advancedFlash"]);
  exact(limits,["ownerDailyCalls","globalDailyCalls","ownerDailyTokens",
    "globalDailyTokens","monthlyBudgetUsdCents"]);
  exact(agent,["maxSteps","maxToolCalls","timeoutSeconds","maxToolOutputBytes"]);
  exact(controls,["requestPaidRouting","requestAgentExecution","requireWriteApproval"]);
  exact(tools,["life","janus","calendar","drive"]);
  if(models.advancedFlash!=="gemini-3.8-flash")
    throw new SyntaxError("unapproved_agent_flash_model");
  const parsed:AgentSettings={
    models:{publicLite:lite(models.publicLite),privateLite:lite(models.privateLite),
      advancedFlash:"gemini-3.8-flash"},
    limits:{ownerDailyCalls:number(limits.ownerDailyCalls,1,200),
      globalDailyCalls:number(limits.globalDailyCalls,1,1000),
      ownerDailyTokens:number(limits.ownerDailyTokens,1000,1_000_000),
      globalDailyTokens:number(limits.globalDailyTokens,1000,5_000_000),
      monthlyBudgetUsdCents:number(limits.monthlyBudgetUsdCents,100,100000)},
    agent:{maxSteps:number(agent.maxSteps,1,16),
      maxToolCalls:number(agent.maxToolCalls,1,32),
      timeoutSeconds:number(agent.timeoutSeconds,10,600),
      maxToolOutputBytes:number(agent.maxToolOutputBytes,1024,65536)},
    controls:{requestPaidRouting:bool(controls.requestPaidRouting),
      requestAgentExecution:bool(controls.requestAgentExecution),
      requireWriteApproval:bool(controls.requireWriteApproval)},
    tools:{life:bool(tools.life),janus:bool(tools.janus),
      calendar:bool(tools.calendar),drive:bool(tools.drive)}
  };
  if(parsed.limits.ownerDailyCalls>parsed.limits.globalDailyCalls ||
     parsed.limits.ownerDailyTokens>parsed.limits.globalDailyTokens ||
     parsed.agent.maxToolCalls>parsed.agent.maxSteps*4 ||
     !parsed.controls.requireWriteApproval)
    throw new SyntaxError("invalid_agent_settings_constraints");
  return parsed;
}

export type AdminDraft={version:number;settings:AgentSettings;updatedAt:string|null};
export type AdminReader={query(sql:string,params?:unknown[]):Promise<{rows:Record<string,unknown>[]}>};
const GET_SQL="SELECT version,settings,updated_at FROM omni_chat.agent_admin_settings WHERE singleton='global'";
const UPDATE_SQL=String.raw`
WITH saved AS (
  INSERT INTO omni_chat.agent_admin_settings(singleton,version,settings,updated_by,updated_at)
    SELECT 'global',1,$2::jsonb,$3::uuid,now()
    WHERE $1::integer=0 OR EXISTS (
      SELECT 1 FROM omni_chat.agent_admin_settings WHERE singleton='global'
    )
  ON CONFLICT(singleton) DO UPDATE SET
    version=omni_chat.agent_admin_settings.version+1,
    settings=excluded.settings,updated_by=excluded.updated_by,updated_at=now()
  WHERE omni_chat.agent_admin_settings.version=$1::integer
  RETURNING version,settings,updated_at
), audit AS (
  INSERT INTO omni_chat.agent_admin_settings_audit(version,settings,updated_by,updated_at)
  SELECT version,settings,$3::uuid,updated_at FROM saved
  RETURNING version
) SELECT saved.version,saved.settings,saved.updated_at
FROM saved JOIN audit USING(version)
`;
function toDraft(row:Record<string,unknown>|undefined):AdminDraft{
  if(!row)return {version:0,settings:validateAgentSettings(DEFAULT_AGENT_SETTINGS),updatedAt:null};
  const version=Number(row.version);
  if(!Number.isSafeInteger(version)||version<1)throw new Error("invalid_admin_draft_version");
  const updated=row.updated_at;
  return {version,settings:validateAgentSettings(row.settings),
    updatedAt:updated instanceof Date?updated.toISOString():String(updated)};
}
export class AgentAdminSettingsStore{
  constructor(private readonly db:AdminReader){}
  async read():Promise<AdminDraft>{
    return toDraft((await this.db.query(GET_SQL)).rows[0]);
  }
  async save(ownerId:string,expectedVersion:unknown,settings:unknown):Promise<AdminDraft>{
    if(!UUID.test(ownerId)||typeof expectedVersion!=="number"||
       !Number.isSafeInteger(expectedVersion)||expectedVersion<0)
      throw new SyntaxError("invalid_agent_admin_version");
    const checked=validateAgentSettings(settings);
    const row=(await this.db.query(UPDATE_SQL,
      [expectedVersion,JSON.stringify(checked),ownerId])).rows[0];
    if(!row)throw new AgentSettingsConflict();
    return toDraft(row);
  }
}