import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";

export type MessageIntent={key:string;contentDigest:string;state:"prepared"|"consumed"|"cancelled";turnId:string|null};
export class MessageIntentConflict extends Error{constructor(){super("message_intent_conflict");}}
export class MessageIntentNotFound extends Error{constructor(){super("message_intent_thread_not_found");}}
type Tx=Pick<PoolClient,"query">;
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const fields="idempotency_key,content_digest,state,turn_id";
export function messageIntentDigest(content:string):string{
  if(typeof content!=="string"||!content.trim()||content.length>50000||Buffer.byteLength(content)>200000)
    throw new SyntaxError("invalid_message_intent_content");
  return createHash("sha256").update(content,"utf8").digest("hex");
}
function identity(owner:string,thread:string,key?:string){
  if(!UUID.test(owner)||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(thread)||(key!==undefined&&!UUID.test(key)))
    throw new SyntaxError("invalid_message_intent_identity");
}
function receipt(row:Record<string,unknown>):MessageIntent{
  if(!["prepared","consumed","cancelled"].includes(String(row.state))||
    typeof row.idempotency_key!=="string"||!UUID.test(row.idempotency_key)||
    typeof row.content_digest!=="string"||!/^[0-9a-f]{64}$/.test(row.content_digest)||
    (row.state==="consumed"?(typeof row.turn_id!=="string"||!UUID.test(row.turn_id)):row.turn_id!==null))
    throw Error("invalid_message_intent_readback");
  return {key:row.idempotency_key,contentDigest:row.content_digest,
    state:row.state as MessageIntent["state"],turnId:row.turn_id as string|null};
}
async function lockThread(tx:Tx,owner:string,thread:string){
  const result=await tx.query("SELECT 1 FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2 AND status='ACTIVE' FOR UPDATE",[owner,thread]);
  if(result.rowCount!==1)throw new MessageIntentNotFound();
}
/** Caller must already hold the thread row lock in its message transaction. */
export async function requirePreparedMessageIntent(tx:Tx,owner:string,thread:string,key:string,content:string):Promise<void>{
  identity(owner,thread,key);const digest=messageIntentDigest(content);
  const result=await tx.query(`SELECT ${fields} FROM omni_chat.message_intents
    WHERE owner_id=$1 AND thread_id=$2 AND idempotency_key=$3 FOR UPDATE`,[owner,thread,key]);
  const row=result.rows[0];
  if(!row||row.state!=="prepared"||row.content_digest!==digest)throw new MessageIntentConflict();
}
/** Same transaction as INSERT turn/event; failure rolls back the turn too. */
export async function consumeMessageIntent(tx:Tx,owner:string,thread:string,key:string,content:string,turnId:string):Promise<void>{
  identity(owner,thread,key);if(!UUID.test(turnId))throw new SyntaxError("invalid_message_intent_turn");
  const result=await tx.query(`UPDATE omni_chat.message_intents SET state='consumed',turn_id=$5,updated_at=now()
    WHERE owner_id=$1 AND thread_id=$2 AND idempotency_key=$3 AND content_digest=$4 AND state='prepared'`,
    [owner,thread,key,messageIntentDigest(content),turnId]);
  if(result.rowCount!==1)throw new MessageIntentConflict();
}
export class MessageIntentStore{
  constructor(private readonly pool:Pick<Pool,"connect">){}
  private async transaction<T>(owner:string,thread:string,operation:(tx:Tx)=>Promise<T>):Promise<T>{
    const c=await this.pool.connect();
    try{await c.query("BEGIN");await lockThread(c,owner,thread);
      const value=await operation(c);await c.query("COMMIT");return value;
    }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
  }
  async prepare(owner:string,thread:string,key:string,content:string):Promise<MessageIntent>{
    identity(owner,thread,key);const digest=messageIntentDigest(content);
    return this.transaction(owner,thread,async tx=>{
      const existing=await tx.query(`SELECT ${fields} FROM omni_chat.message_intents
        WHERE owner_id=$1 AND thread_id=$2 AND idempotency_key=$3 FOR UPDATE`,[owner,thread,key]);
      if(existing.rows[0]){
        const row=existing.rows[0];
        if(row.content_digest!==digest||row.state==="cancelled")throw new MessageIntentConflict();return receipt(row);
      }
      const busy=await tx.query(`SELECT 1 FROM omni_chat.message_intents
        WHERE owner_id=$1 AND thread_id=$2 AND state='prepared'
        UNION ALL SELECT 1 FROM omni_chat.turns WHERE owner_id=$1 AND thread_id=$2 AND status IN ('QUEUED','RUNNING') LIMIT 1`,[owner,thread]);
      if(busy.rowCount)throw new MessageIntentConflict();
      const inserted=await tx.query(`INSERT INTO omni_chat.message_intents(owner_id,thread_id,idempotency_key,content_digest,state)
        VALUES($1,$2,$3,$4,'prepared') RETURNING ${fields}`,[owner,thread,key,digest]);return receipt(inserted.rows[0]);
    });
  }
  async active(owner:string,thread:string):Promise<MessageIntent|null>{
    identity(owner,thread);
    return this.transaction(owner,thread,async tx=>{
      const result=await tx.query(`SELECT ${fields} FROM omni_chat.message_intents
        WHERE owner_id=$1 AND thread_id=$2 AND state IN ('prepared','consumed')
        ORDER BY (state='prepared') DESC,updated_at DESC,idempotency_key LIMIT 1`,[owner,thread]);
      return result.rows[0]?receipt(result.rows[0]):null;
    });
  }
  async read(owner:string,thread:string,key:string):Promise<MessageIntent|null>{
    identity(owner,thread,key);
    return this.transaction(owner,thread,async tx=>{
      const result=await tx.query(`SELECT ${fields} FROM omni_chat.message_intents
        WHERE owner_id=$1 AND thread_id=$2 AND idempotency_key=$3`,[owner,thread,key]);
      return result.rows[0]?receipt(result.rows[0]):null;
    });
  }
  async cancel(owner:string,thread:string,key:string):Promise<MessageIntent>{
    identity(owner,thread,key);
    return this.transaction(owner,thread,async tx=>{
      const result=await tx.query(`SELECT ${fields} FROM omni_chat.message_intents
        WHERE owner_id=$1 AND thread_id=$2 AND idempotency_key=$3 FOR UPDATE`,[owner,thread,key]);
      const row=result.rows[0];if(!row||row.state==="consumed")throw new MessageIntentConflict();
      if(row.state==="cancelled")return receipt(row);
      const updated=await tx.query(`UPDATE omni_chat.message_intents SET state='cancelled',updated_at=now()
        WHERE owner_id=$1 AND thread_id=$2 AND idempotency_key=$3 AND state='prepared' RETURNING ${fields}`,[owner,thread,key]);
      if(updated.rowCount!==1)throw new MessageIntentConflict();return receipt(updated.rows[0]);
    });
  }
}
