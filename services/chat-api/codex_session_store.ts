import type { Pool } from "pg";
import { ChatConflict, ChatNotFound, safeRecord } from "./storage.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const types = new Set(["text_delta","item_upsert","tool_request","tool_result",
  "approval_request","approval_resolved","citation","usage",
  "turn_completed","turn_cancelled","turn_error"]);
const terminals = new Set(["turn_completed","turn_cancelled","turn_error"]);
const finalStates = new Set(["COMPLETED","CANCELLED","ERROR","CLEANUP_PENDING"]);
const states = new Set(["IN_PROGRESS","AWAITING_APPROVAL",...finalStates]);

type Binding = {ownerId: string; threadId: string; turnId: string};
export type CodexPhase = Binding & {
  status: string; turnHandle: string; nativeThreadId: string; nativeTurnId: string;
  cursor: number; events: Array<{seq:number;type:string;payload:Record<string,unknown>}>;
};
export type CodexControl = Binding & {
  turnHandle: string; nativeThreadId: string; nativeTurnId: string;
  cursor: number;
};

export function parseCodexPhase(input: unknown, bind: Binding): CodexPhase {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ChatConflict("invalid Codex phase");
  const item = input as Record<string,unknown>;
  if (!states.has(String(item.status)) || item.ownerId !== bind.ownerId ||
      item.threadId !== bind.threadId || item.turnId !== bind.turnId ||
      ![item.turnHandle,item.nativeThreadId,item.nativeTurnId].every(v => typeof v === "string" && ID.test(v)) ||
      !Number.isSafeInteger(item.cursor) || Number(item.cursor)<-1 ||
      !Array.isArray(item.events) || item.events.length > 200)
    throw new ChatConflict("Codex owner/phase binding failed");
  const events: CodexPhase["events"] = [];
  let cursor = -1;
  for (const raw of item.events) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new ChatConflict("invalid native event");
    const row = raw as Record<string,unknown>;
    if (row.ownerId !== undefined && row.ownerId !== bind.ownerId)
      throw new ChatConflict("foreign native owner");
    if (row.threadId !== item.nativeThreadId || row.turnId !== item.nativeTurnId ||
        !Number.isSafeInteger(row.seq) || Number(row.seq) <= cursor ||
        typeof row.type !== "string" || !types.has(row.type))
      throw new ChatConflict("foreign or unordered native event");
    const payload = safeRecord(row.payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        Buffer.byteLength(JSON.stringify(payload)) > 65_536)
      throw new ChatConflict("unsafe native event payload");
    // Native owner/thread/turn bindings are private execution references;
    // browsers only need the request ID, digest, operation and reason.
    const clean = {...(payload as Record<string,unknown>)};
    if (row.type === "approval_request") {
      delete clean.ownerId;
      delete clean.threadId;
      delete clean.turnId;
      const request = String(clean.requestId ?? "");
      const expiry = Date.parse(String(clean.expiresAt ?? ""));
      if (!ID.test(request) || !["shell","write_file"].includes(String(clean.operation)) ||
          !DIGEST.test(String(clean.paramsDigest)) || !Number.isFinite(expiry) ||
          expiry <= Date.now() || expiry > Date.now()+600_000)
        throw new ChatConflict("invalid native approval");
    }
    cursor = Number(row.seq);
    events.push({seq:cursor,type:row.type,payload:row.type==="text_delta" &&
      typeof clean.delta==="string" && typeof clean.text!=="string"
      ? {...clean,text:clean.delta} : clean});
  }
  if (events.length && cursor !== item.cursor)
    throw new ChatConflict("Codex cursor does not cover native events");
  const last = events.at(-1)?.type;
  const terminalCount = events.filter(e=>terminals.has(e.type)).length;
  if (finalStates.has(String(item.status))) {
    // A clean native terminal must be committed atomically with every delta.
    if (String(item.status)!=="CLEANUP_PENDING" && (terminalCount!==1 || !last || !terminals.has(last)))
      throw new ChatConflict("native terminal event missing");
  } else if (terminalCount>0 ||
      (item.status==="AWAITING_APPROVAL" && !events.some(e=>e.type==="approval_request")) ||
      (item.status==="IN_PROGRESS" && events.some(e=>e.type==="approval_request")))
    throw new ChatConflict("Codex nonterminal phase invalid");
  return {...bind,status:String(item.status),turnHandle:String(item.turnHandle),
    nativeThreadId:String(item.nativeThreadId),nativeTurnId:String(item.nativeTurnId),
    cursor:Number(item.cursor),events};
}

/** Durable controller for one Owner-scoped native Codex turn.
 * Native handles never appear in browser events, responses or logs.
 * Busy/unknown RPC outcomes require explicit operator reconciliation.
 */
export class CodexSessionStore {
  constructor(private readonly pool: Pool) {}

  async ready():Promise<void> {
    const result=await this.pool.query(
      "SELECT to_regclass('omni_chat.codex_turn_sessions') AS relation");
    if (!result.rows[0]?.relation)
      throw new ChatConflict("Codex session migration 004 is required");
  }

  async begin(ownerId:string,threadId:string,turnId:string,
    action:"poll"|"cancel"|"approval",
    approval?:{requestId:string;paramsDigest:string;approved:boolean}): Promise<CodexControl> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query(
        `SELECT s.*, t.status AS turn_status FROM omni_chat.codex_turn_sessions AS s
         JOIN omni_chat.turns AS t USING(owner_id,thread_id,turn_id)
         WHERE s.owner_id=$1 AND s.thread_id=$2 AND s.turn_id=$3
         FOR UPDATE OF s,t`,[ownerId,threadId,turnId])).rows[0];
      if (!row) throw new ChatNotFound("active Codex turn not found");
      if (row.turn_status!=="RUNNING" || row.phase!=="IDLE")
        throw new ChatConflict("Codex turn needs reconciliation or is busy");
      if (action==="approval") {
        if (!approval || !ID.test(approval.requestId) || !DIGEST.test(approval.paramsDigest))
          throw new ChatConflict("invalid Codex approval");
        const result=await client.query(
          `UPDATE omni_chat.approvals SET status='RESOLVING'
           WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3 AND request_id=$4
             AND params_digest=$5 AND status='PENDING' AND expires_at>now()
           RETURNING request_id`,
          [ownerId,threadId,turnId,approval.requestId,approval.paramsDigest]);
        if (result.rowCount!==1) throw new ChatConflict("Codex approval expired or mismatched");
      }
      await client.query(
        `UPDATE omni_chat.codex_turn_sessions SET phase=$4,updated_at=now()
         WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3`,
        [ownerId,threadId,turnId,action==="poll"?"POLLING":action==="cancel"?"CANCELLING":"RESOLVING"]);
      await client.query("COMMIT");
      return {ownerId,threadId,turnId,turnHandle:String(row.turn_handle),
        nativeThreadId:String(row.native_thread_id),nativeTurnId:String(row.native_turn_id),
        cursor:Number(row.native_cursor)};
    } catch(e) {await client.query("ROLLBACK");throw e;}
    finally {client.release();}
  }

  async record(phase:CodexPhase, approval?:{requestId:string;approved:boolean}):Promise<void> {
    const {ownerId,threadId,turnId}=phase;
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      const turn=(await client.query(
        `SELECT status FROM omni_chat.turns WHERE owner_id=$1 AND thread_id=$2
         AND turn_id=$3 FOR UPDATE`,[ownerId,threadId,turnId])).rows[0];
      if (!turn) throw new ChatNotFound("Codex turn not found");
      if (turn.status!=="RUNNING") throw new ChatConflict("Codex turn no longer running");
      const old=(await client.query(
        `SELECT * FROM omni_chat.codex_turn_sessions WHERE owner_id=$1
          AND thread_id=$2 AND turn_id=$3 FOR UPDATE`,
        [ownerId,threadId,turnId])).rows[0];
      if (old && (old.turn_handle!==phase.turnHandle ||
          old.native_thread_id!==phase.nativeThreadId ||
          old.native_turn_id!==phase.nativeTurnId))
        throw new ChatConflict("native session binding changed");
      const previous=old?Number(old.native_cursor):-1;
      if (phase.cursor<previous || phase.events.some(e=>e.seq<=previous))
        throw new ChatConflict("native replay requires reconciliation");
      if (old && old.phase==="IDLE")
        throw new ChatConflict("unreserved native phase");
      if (approval) {
        if (!old || old.phase!=="RESOLVING" || !ID.test(approval.requestId))
          throw new ChatConflict("approval reservation missing");
        const updated=await client.query(
          `UPDATE omni_chat.approvals SET status=$5,resolved_at=now()
           WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3
             AND request_id=$4 AND status='RESOLVING' RETURNING request_id`,
          [ownerId,threadId,turnId,approval.requestId,
            approval.approved?"APPROVED":"DENIED"]);
        if (updated.rowCount!==1) throw new ChatConflict("approval completion conflict");
      }
      const base=Number((await client.query(
        `SELECT COALESCE(MAX(seq),-1)+1 AS seq FROM omni_chat.events
          WHERE owner_id=$1 AND thread_id=$2`,[ownerId,threadId])).rows[0].seq);
      for (const [index,event] of phase.events.entries()) {
        await client.query(
          `INSERT INTO omni_chat.events(owner_id,thread_id,turn_id,event_id,seq,event_type,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ownerId,threadId,turnId,`codex-${turnId}-${event.seq}`,
            base+index,event.type,JSON.stringify(event.payload)]);
        if (event.type==="approval_request") {
          const p=event.payload;
          await client.query(
            `INSERT INTO omni_chat.approvals(owner_id,thread_id,turn_id,request_id,operation,params_digest,expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [ownerId,threadId,turnId,String(p.requestId),String(p.operation),
              String(p.paramsDigest),String(p.expiresAt)]);
        }
      }
      if (finalStates.has(phase.status)) {
        if (phase.status==="CLEANUP_PENDING") {
          await client.query(
            `INSERT INTO omni_chat.events(owner_id,thread_id,turn_id,event_id,seq,event_type,payload)
             VALUES ($1,$2,$3,$4,$5,'turn_error',$6)`,
            [ownerId,threadId,turnId,`codex-${turnId}-cleanup`,
              base+phase.events.length,JSON.stringify({code:"codex_cleanup_needs_reconciliation"})]);
        }
        const status=phase.status==="COMPLETED"?"COMPLETED":
          phase.status==="CANCELLED"?"CANCELLED":"ERROR";
        await client.query(
          `UPDATE omni_chat.turns SET status=$4,completed_at=now()
           WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3`,
          [ownerId,threadId,turnId,status]);
        if (old) await client.query(
          `DELETE FROM omni_chat.codex_turn_sessions
            WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3`,
            [ownerId,threadId,turnId]);
      } else if (old) {
        await client.query(
          `UPDATE omni_chat.codex_turn_sessions
           SET native_cursor=$4,phase='IDLE',updated_at=now()
           WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3`,
          [ownerId,threadId,turnId,phase.cursor]);
      } else {
        await client.query(
          `INSERT INTO omni_chat.codex_turn_sessions
           (owner_id,thread_id,turn_id,turn_handle,native_thread_id,native_turn_id,native_cursor)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ownerId,threadId,turnId,phase.turnHandle,phase.nativeThreadId,
            phase.nativeTurnId,phase.cursor]);
      }
      await client.query("COMMIT");
    } catch(e) {await client.query("ROLLBACK");throw e;}
    finally {client.release();}
  }
}
