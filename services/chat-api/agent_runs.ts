import {randomUUID} from "node:crypto";
import type {AgentLoopLimits,AgentObservation,AgentDecision} from "../agent-gateway/agent_loop.js";

export type AgentPolicy={limits:AgentLoopLimits;maxTokens:number;maxCostMicros:number;
  maxDecisionTokens:number;maxDecisionCostMicros:number;grants:string[];allowL2:boolean};
export type AgentCheckpoint={steps:number;toolCalls:number;observations:AgentObservation[];
  phase:"ready"|"decision"|"tool";tokens:number;costMicros:number;pendingDecision?:AgentDecision};
export type AgentRun={owner_id:string;run_id:string;thread_id:string;turn_id:string;
  question:string;policy:AgentPolicy;status:string;fence:number;checkpoint:AgentCheckpoint;
  created_at:Date|string;result:unknown};
export type AgentDb={query(sql:string,params?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;
 connect?:()=>Promise<AgentDb&{release:()=>void}>};
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function agentId(id:string):string{if(!UUID.test(id))throw new SyntaxError("invalid_agent_id");return id;}
export function validateAgentPolicy(p:AgentPolicy):void{
 const l=p?.limits;
 if(!l||![l.maxSteps,l.maxToolCalls,l.timeoutMs,l.maxToolOutputBytes,p.maxTokens,
  p.maxCostMicros,p.maxDecisionTokens,p.maxDecisionCostMicros].every(n=>Number.isSafeInteger(n)&&n>0)||
  l.maxSteps>16||l.maxToolCalls>32||l.timeoutMs<100||l.timeoutMs>600000||
  l.maxToolOutputBytes<1024||l.maxToolOutputBytes>65536||l.maxToolCalls>l.maxSteps*4||
  p.maxTokens>1000000||p.maxCostMicros>10000000||p.maxDecisionTokens>p.maxTokens||
  p.maxDecisionCostMicros>p.maxCostMicros||typeof p.allowL2!=="boolean"||
  !Array.isArray(p.grants)||p.grants.length>128||p.grants.some(x=>typeof x!=="string"||
  !/^[a-zA-Z][a-zA-Z0-9_.:-]{1,191}$/.test(x)))throw new SyntaxError("invalid_agent_policy");
}
function run(row:Record<string,unknown>|undefined):AgentRun|null{
 return row?{...row,fence:Number(row.fence)} as AgentRun:null;
}
export class PgAgentRunStore{
 async list(ownerId:string,threadId:string){
  return (await this.db.query(`SELECT run_id,thread_id,turn_id,status,created_at,updated_at,result
   FROM omni_chat.agent_runs WHERE owner_id=$1 AND thread_id=$2 ORDER BY created_at DESC LIMIT 100`,
   [agentId(ownerId),threadId])).rows;
 }
 constructor(readonly db:AgentDb){}
 async create(ownerId:string,threadId:string,turnId:string,question:string,policy:AgentPolicy){
  agentId(ownerId);validateAgentPolicy(policy);
  if(typeof question!=="string"||!question.trim()||Buffer.byteLength(question)>8192||
   !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(threadId)||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(turnId))
   throw new SyntaxError("invalid_agent_run");
  // FK and SELECT bind the run to an existing verified Owner's Chat turn.
  const row=(await this.db.query(`INSERT INTO omni_chat.agent_runs
   (owner_id,run_id,thread_id,turn_id,question,policy)
   SELECT $1,$2,$3,$4,$5,$6::jsonb FROM omni_chat.turns
   WHERE owner_id=$1 AND thread_id=$3 AND turn_id=$4 AND execution_mode='agent'
   ON CONFLICT(owner_id,thread_id,turn_id) DO NOTHING RETURNING *`,
   [ownerId,randomUUID(),threadId,turnId,question,JSON.stringify(policy)])).rows[0];
  if(row)return run(row)!;
  const existing=(await this.db.query(`SELECT * FROM omni_chat.agent_runs
   WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3`,[ownerId,threadId,turnId])).rows[0];
  if(!existing)throw new Error("agent_turn_not_found");
  if(existing.question!==question)throw new Error("agent_run_intent_conflict");
  return run(existing)!;
 }
 async get(ownerId:string,runId:string){return run((await this.db.query(
  "SELECT * FROM omni_chat.agent_runs WHERE owner_id=$1 AND run_id=$2",
  [agentId(ownerId),agentId(runId)])).rows[0]);}
 async cancel(ownerId:string,runId:string){
  const existing=await this.get(ownerId,runId);if(!existing)return null;
  return this.transaction(async db=>{
   await db.query("SELECT 1 FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2 FOR UPDATE",[ownerId,existing.thread_id]);
   const updated=run((await db.query(`UPDATE omni_chat.agent_runs SET status='cancelled',fence=fence+1,
    lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND run_id=$2
    AND status IN ('queued','running','blocked') RETURNING *`,[ownerId,runId])).rows[0]);
   if(!updated)return null;
   await this.insertEvent(db,updated,"turn_cancelled",{runId});
   await db.query(`UPDATE omni_chat.turns SET status='CANCELLED',completed_at=now()
    WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3 AND execution_mode='agent'`,[ownerId,updated.thread_id,updated.turn_id]);
   return updated;
  });
 }
 async resume(ownerId:string,runId:string){return run((await this.db.query(`UPDATE omni_chat.agent_runs
  SET status='queued',updated_at=now() WHERE owner_id=$1 AND run_id=$2
  AND status IN ('cancelled','blocked','failed') AND checkpoint->>'phase'='ready'
  AND NOT EXISTS(SELECT 1 FROM omni_chat.agent_tool_receipts r WHERE r.owner_id=$1
   AND r.run_id=$2 AND r.status IN ('executing','unknown')) RETURNING *`,
  [agentId(ownerId),agentId(runId)])).rows[0]);}
 async claim(ownerId:string,runId:string){
  // Unknown model charges/effects require reconciliation; never replay an interrupted phase.
  await this.db.query(`UPDATE omni_chat.agent_runs SET status='blocked',fence=fence+1,
   lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND run_id=$2 AND status='running'
   AND lease_until<=now() AND checkpoint->>'phase'<>'ready'`,[agentId(ownerId),agentId(runId)]);
  const claimed=run((await this.db.query(`UPDATE omni_chat.agent_runs SET status='running',fence=fence+1,
   lease_until=now()+interval '30 seconds',updated_at=now() WHERE owner_id=$1 AND run_id=$2
   AND (status='queued' OR (status='running' AND lease_until<=now() AND checkpoint->>'phase'='ready'))
   RETURNING *`,[ownerId,runId])).rows[0]);
  if(claimed)await this.db.query(`UPDATE omni_chat.turns SET status='RUNNING',completed_at=NULL
   WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3 AND execution_mode='agent' AND status IN ('QUEUED','CANCELLED')`,
   [ownerId,claimed.thread_id,claimed.turn_id]);
  return claimed;
 }
 async checkpoint(r:AgentRun,state:AgentCheckpoint){
  if(Buffer.byteLength(JSON.stringify(state))>1048576)throw new Error("agent_checkpoint_oversize");
  const rows=(await this.db.query(`WITH saved AS (UPDATE omni_chat.agent_runs
   SET checkpoint=$4::jsonb,lease_until=now()+interval '30 seconds',updated_at=now()
   WHERE owner_id=$1 AND run_id=$2 AND fence=$3 AND status='running' AND lease_until>now()
   RETURNING owner_id,run_id,fence,checkpoint)
   INSERT INTO omni_chat.agent_steps(owner_id,run_id,fence,checkpoint)
   SELECT owner_id,run_id,fence,checkpoint FROM saved RETURNING fence`,
   [r.owner_id,r.run_id,r.fence,JSON.stringify(state)])).rows;
  if(!rows.length)throw new Error("agent_lease_lost");
 }
 async heartbeat(r:AgentRun){
  const rows=(await this.db.query(`UPDATE omni_chat.agent_runs SET lease_until=now()+interval '30 seconds'
   WHERE owner_id=$1 AND run_id=$2 AND fence=$3 AND status='running' AND lease_until>now()
   RETURNING fence`,[r.owner_id,r.run_id,r.fence])).rows;
  if(!rows.length)throw new Error("agent_lease_lost");
 }
 async finish(r:AgentRun,status:"completed"|"blocked"|"failed",result:unknown){
  if(status!=="completed"){
   const rows=(await this.db.query(`UPDATE omni_chat.agent_runs SET status=$4,result=$5::jsonb,
   lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND run_id=$2 AND fence=$3
   AND status='running' AND lease_until>now() RETURNING run_id`,
   [r.owner_id,r.run_id,r.fence,status,JSON.stringify(result)])).rows;
   if(!rows.length)throw new Error("agent_lease_lost");return;
  }
  await this.transaction(async db=>{
   await db.query("SELECT 1 FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2 FOR UPDATE",[r.owner_id,r.thread_id]);
   const rows=(await db.query(`UPDATE omni_chat.agent_runs SET status='completed',result=$4::jsonb,
    lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND run_id=$2 AND fence=$3 AND status='running'
    AND lease_until>now() RETURNING run_id`,[r.owner_id,r.run_id,r.fence,JSON.stringify(result)])).rows;
   if(!rows.length)throw new Error("agent_lease_lost");
   const text=(result as {text?:string}).text;
   if(text)await this.insertEvent(db,r,"text_delta",{text});
   await this.insertEvent(db,r,"turn_completed",{runId:r.run_id});
   await db.query(`UPDATE omni_chat.turns SET status='COMPLETED',completed_at=now()
    WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3 AND execution_mode='agent'`,[r.owner_id,r.thread_id,r.turn_id]);
  });
 }
 private async transaction<T>(body:(db:AgentDb)=>Promise<T>):Promise<T>{
  if(!this.db.connect)throw new Error("agent_database_transactions_unavailable");
  const db=await this.db.connect();
  try{await db.query("BEGIN");const value=await body(db);await db.query("COMMIT");return value;}
  catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
 }
 private async insertEvent(db:AgentDb,r:AgentRun,type:string,payload:unknown){
  if(Buffer.byteLength(JSON.stringify(payload))>65536)throw new Error("agent_event_oversize");
  await db.query(`INSERT INTO omni_chat.events(owner_id,thread_id,turn_id,event_id,seq,event_type,payload)
   SELECT $1,$2,$3,$4,COALESCE(MAX(seq),-1)+1,$5,$6::jsonb FROM omni_chat.events
   WHERE owner_id=$1 AND thread_id=$2`,[r.owner_id,r.thread_id,r.turn_id,randomUUID(),type,JSON.stringify(payload)]);
 }
 async emit(r:AgentRun,type:"tool_request"|"tool_result"|"approval_request"|"usage"|"approval_resolved",payload:unknown){
  await this.transaction(async db=>{
   await db.query("SELECT 1 FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2 FOR UPDATE",[r.owner_id,r.thread_id]);
   const valid=(await db.query(`SELECT 1 FROM omni_chat.agent_runs WHERE owner_id=$1 AND run_id=$2
    AND fence=$3 AND status='running' AND lease_until>now() FOR UPDATE`,[r.owner_id,r.run_id,r.fence])).rows;
   if(!valid.length)throw new Error("agent_lease_lost");
   await this.insertEvent(db,r,type,payload);
  });
 }
 async approve(ownerId:string,runId:string,actionId:string,digest:string,expiresAt:string){
  if(!/^[a-f0-9]{64}$/.test(digest)||!Number.isFinite(Date.parse(expiresAt))||
    Date.parse(expiresAt)<=Date.now()||Date.parse(expiresAt)>Date.now()+900000)
   throw new SyntaxError("invalid_agent_approval");
  const rows=(await this.db.query(`UPDATE omni_chat.agent_tool_receipts t
   SET status='approved',expires_at=$5 FROM omni_chat.agent_runs r
   WHERE t.owner_id=$1 AND t.run_id=$2 AND t.action_id=$3 AND t.digest=$4 AND t.status='pending'
   AND t.expires_at>now() AND r.owner_id=t.owner_id AND r.run_id=t.run_id AND r.policy->>'allowL2'='true'
   RETURNING t.action_id`,
   [agentId(ownerId),agentId(runId),agentId(actionId),digest,expiresAt])).rows;
  if(!rows.length)throw new Error("agent_approval_conflict");
 }
 async proposeAction(r:AgentRun,actionId:string,digest:string,toolName:string,input:Record<string,unknown>){
  await this.db.query(`INSERT INTO omni_chat.agent_tool_receipts
   (owner_id,run_id,action_id,digest,tool_name,input,expires_at,status)
   SELECT owner_id,run_id,$3,$4,$5,$6::jsonb,now()+interval '15 minutes','pending'
   FROM omni_chat.agent_runs WHERE owner_id=$1 AND run_id=$2 AND fence=$7
   AND status='running' AND lease_until>now() ON CONFLICT DO NOTHING`,
   [r.owner_id,r.run_id,actionId,digest,toolName,JSON.stringify(input),r.fence]);
  return (await this.db.query(`SELECT status FROM omni_chat.agent_tool_receipts
   WHERE owner_id=$1 AND run_id=$2 AND action_id=$3 AND digest=$4`,[r.owner_id,r.run_id,actionId,digest])).rows[0];
 }
 async events(ownerId:string,runId:string,afterSequence=0){
  if(!Number.isSafeInteger(afterSequence)||afterSequence<0)throw new SyntaxError("invalid_agent_cursor");
  return (await this.db.query(`SELECT sequence,fence,checkpoint,recorded_at FROM omni_chat.agent_steps
   WHERE owner_id=$1 AND run_id=$2 AND sequence>$3 ORDER BY sequence LIMIT 100`,
   [agentId(ownerId),agentId(runId),afterSequence])).rows;
 }
 async approvals(ownerId:string,runId:string){return (await this.db.query(`SELECT action_id,digest,tool_name,
  input,expires_at,status,result FROM omni_chat.agent_tool_receipts WHERE owner_id=$1 AND run_id=$2
  ORDER BY action_id LIMIT 100`,[agentId(ownerId),agentId(runId)])).rows;}
 /** Internal operator-only: the caller must verify this external receipt through the approved Gateway. */
 async reconcile(ownerId:string,runId:string,operatorId:string,receipt:{receiptId:string;verified:true;
  outcome:"completed"|"failed";source:string;externalId:string;result:unknown}){
  if(!operatorId||operatorId.length>256||receipt.verified!==true||!receipt.source||!receipt.externalId||
    !["completed","failed"].includes(receipt.outcome)||Buffer.byteLength(JSON.stringify(receipt))>65536)
   throw new SyntaxError("invalid_agent_reconciliation_receipt");
  const existing=await this.get(ownerId,runId);if(!existing)throw new Error("agent_run_not_found");
  agentId(receipt.receiptId);
  await this.transaction(async db=>{
   await db.query("SELECT 1 FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2 FOR UPDATE",[ownerId,existing.thread_id]);
   const rows=(await db.query(`WITH resolved AS (UPDATE omni_chat.agent_runs
    SET status=$4,result=$5::jsonb,fence=fence+1,lease_until=NULL,updated_at=now()
    WHERE owner_id=$1 AND run_id=$2 AND status IN ('blocked','cancelled') RETURNING owner_id,run_id)
    INSERT INTO omni_chat.agent_reconciliations(owner_id,run_id,receipt_id,operator_id,external_receipt)
    SELECT owner_id,run_id,$3,$6,$5::jsonb FROM resolved RETURNING receipt_id`,
    [ownerId,runId,receipt.receiptId,receipt.outcome,JSON.stringify(receipt),operatorId])).rows;
   if(!rows.length)throw new Error("agent_reconciliation_conflict");
   const text=(receipt.result as {text?:unknown}|null)?.text;
   if(receipt.outcome==="completed"&&typeof text==="string")await this.insertEvent(db,existing,"text_delta",{text});
   await this.insertEvent(db,existing,receipt.outcome==="completed"?"turn_completed":"turn_error",{runId,reconciled:true});
   await db.query(`UPDATE omni_chat.turns SET status=$4,completed_at=now()
    WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3 AND execution_mode='agent'`,
    [ownerId,existing.thread_id,existing.turn_id,receipt.outcome==="completed"?"COMPLETED":"ERROR"]);
  });
 }
 async beginAction(r:AgentRun,actionId:string,digest:string){
  const rows=(await this.db.query(`UPDATE omni_chat.agent_tool_receipts t SET status='executing'
   FROM omni_chat.agent_runs r WHERE t.owner_id=$1 AND t.run_id=$2 AND t.action_id=$3
   AND t.digest=$4 AND t.status='approved' AND t.expires_at>now()
   AND r.owner_id=t.owner_id AND r.run_id=t.run_id AND r.fence=$5 AND r.status='running'
   AND r.lease_until>now() RETURNING t.action_id`,
   [r.owner_id,r.run_id,agentId(actionId),digest,r.fence])).rows;
  if(!rows.length)throw new Error("agent_approval_required");
 }
 async actionResult(r:AgentRun,actionId:string,status:"confirmed"|"unknown",result:unknown){
  if(Buffer.byteLength(JSON.stringify(result))>65536)throw new Error("agent_receipt_oversize");
  const rows=(await this.db.query(`UPDATE omni_chat.agent_tool_receipts t SET status=$4,result=$5::jsonb
   FROM omni_chat.agent_runs r WHERE t.owner_id=$1 AND t.run_id=$2 AND t.action_id=$3
   AND t.status='executing' AND r.owner_id=t.owner_id AND r.run_id=t.run_id AND r.fence=$6
   AND r.status='running' AND r.lease_until>now() RETURNING t.action_id`,
   [r.owner_id,r.run_id,actionId,status,JSON.stringify(result),r.fence])).rows;
  if(!rows.length)throw new Error("agent_lease_lost");
 }
 async authorizeAction(input:{ownerId:string;runId:string;actionId:string;toolName:string;
  arguments:Record<string,unknown>;paramsDigest:string;operation:"write"|"readback"}):Promise<boolean>{
  agentId(input.ownerId);agentId(input.runId);agentId(input.actionId);
  if(!/^[a-f0-9]{64}$/.test(input.paramsDigest)||!["write","readback"].includes(input.operation)||
   Buffer.byteLength(JSON.stringify(input.arguments))>8192)throw new SyntaxError("invalid_agent_action_authorization");
  const params=[input.ownerId,input.runId,input.actionId,input.toolName,input.paramsDigest,JSON.stringify(input.arguments)];
  // The one-way Gateway claim is separate from the Worker claim; duplicate signed RPCs cannot repeat a write.
  const sql=input.operation==="write"?`UPDATE omni_chat.agent_tool_receipts t SET gateway_started_at=now()
   FROM omni_chat.agent_runs r WHERE t.owner_id=$1 AND t.run_id=$2 AND t.action_id=$3
   AND t.tool_name=$4 AND t.digest=$5 AND t.input=$6::jsonb AND t.status='executing'
   AND t.gateway_started_at IS NULL AND t.expires_at>now() AND r.owner_id=t.owner_id AND r.run_id=t.run_id
   AND r.status='running' AND r.lease_until>now() AND r.policy->>'allowL2'='true' RETURNING t.action_id`:
   `SELECT t.action_id FROM omni_chat.agent_tool_receipts t JOIN omni_chat.agent_runs r
    ON r.owner_id=t.owner_id AND r.run_id=t.run_id WHERE t.owner_id=$1 AND t.run_id=$2 AND t.action_id=$3
    AND t.tool_name=$4 AND t.digest=$5 AND t.input=$6::jsonb AND t.status IN ('executing','unknown')
    AND t.gateway_started_at IS NOT NULL AND r.policy->>'allowL2'='true'
    AND (r.status IN ('blocked','cancelled') OR (r.status='running' AND r.lease_until>now()))`;
  return (await this.db.query(sql,params)).rows.length===1;
 }
}
