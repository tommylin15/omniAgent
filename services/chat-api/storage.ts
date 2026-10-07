import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { authorizeApproval } from "../agent-gateway/agent_security.js";

export class ChatConflict extends Error {}
export class ChatNotFound extends Error {}

export type ThreadInput = { threadId?: string; runtime: "openrouter" | "gemini" | "codex";
  model: string; assistantProfile: string; skillProfile?: string; parentThreadId?: string };
export type ApprovalInput = { ownerId: string; threadId: string; turnId: string; requestId: string;
  operation: "shell" | "write_file"; paramsDigest: string; expiresAt: string };
export type SkillContent = { prompt: string; required_tools?: string[];
  workflow?: { tool: string; args?: Record<string, unknown> }[] };

const forbidden = /^(?:api_key|apikey|auth_cache|authcache|authorization|credential|password|raw_provider_error|refresh_token|refreshtoken|secret|token|access_token|accesstoken)$|_(?:api_key|credential|password|secret|access_token|refresh_token)$/i;

export function safeRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeRecord);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (forbidden.test(key)) throw new Error("credential field cannot be persisted");
    return [key, safeRecord(item)];
  }));
  return value;
}

function digest(value: unknown): string {
  return "sha256:" + createHash("sha256").update(JSON.stringify(safeRecord(value))).digest("hex");
}

export class ChatStore {
  constructor(private readonly pool: Pool) {}

  async ready(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async writeSkillRevision(ownerId: string, skillId: string, revision: number,
                           content: SkillContent, key: string): Promise<Record<string, unknown>> {
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(skillId) || !Number.isSafeInteger(revision) || revision < 1 ||
        !key || key.length > 128 || typeof content?.prompt !== "string" ||
        !content.prompt.trim() || content.prompt.length > 12_000) throw new Error("skill revision is invalid");
    const clean = safeRecord(content);
    const json = JSON.stringify(clean);
    if (Buffer.byteLength(json) > 65_536) throw new Error("skill content is too large");
    const contentDigest = digest(clean);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = (await client.query(
        `INSERT INTO omni_chat.skill_revisions(owner_id,skill_id,revision,content_digest,content,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *`,
        [ownerId,skillId,revision,contentDigest,json,key])).rows[0];
      const row = inserted ?? (await client.query(
        `SELECT * FROM omni_chat.skill_revisions WHERE owner_id=$1 AND idempotency_key=$2`,
        [ownerId,key])).rows[0];
      if (!row || row.skill_id !== skillId || row.revision !== revision || row.content_digest !== contentDigest) {
        throw new ChatConflict("skill revision or idempotency key conflicts");
      }
      if (inserted) await client.query(
        `INSERT INTO omni_chat.skill_state(owner_id,skill_id,current_revision) VALUES ($1,$2,$3)
         ON CONFLICT (owner_id,skill_id) DO UPDATE SET
         current_revision=GREATEST(omni_chat.skill_state.current_revision,EXCLUDED.current_revision),updated_at=now()`,
        [ownerId,skillId,revision]);
      await client.query("COMMIT");
      return row;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async readSkillRevision(ownerId: string, skillId: string, revision: number): Promise<Record<string, unknown>> {
    const row = (await this.pool.query(
      `SELECT * FROM omni_chat.skill_revisions WHERE owner_id=$1 AND skill_id=$2 AND revision=$3`,
      [ownerId,skillId,revision])).rows[0];
    if (!row) throw new ChatNotFound("skill revision not found");
    return row;
  }

  async skillState(ownerId: string, skillId: string): Promise<Record<string, unknown>> {
    const row = (await this.pool.query(
      `SELECT * FROM omni_chat.skill_state WHERE owner_id=$1 AND skill_id=$2`, [ownerId,skillId])).rows[0];
    if (!row) throw new ChatNotFound("skill state not found");
    return row;
  }

  async setSkillState(ownerId: string, skillId: string, enabled: boolean,
                      revision?: number): Promise<Record<string, unknown>> {
    if (typeof enabled !== "boolean") throw new Error("skill state is invalid");
    const selected = revision ?? Number((await this.skillState(ownerId,skillId)).current_revision);
    await this.readSkillRevision(ownerId,skillId,selected);
    return (await this.pool.query(
      `INSERT INTO omni_chat.skill_state(owner_id,skill_id,current_revision,enabled) VALUES ($1,$2,$3,$4)
       ON CONFLICT (owner_id,skill_id) DO UPDATE SET
       current_revision=EXCLUDED.current_revision,enabled=EXCLUDED.enabled,updated_at=now() RETURNING *`,
      [ownerId,skillId,selected,enabled])).rows[0];
  }

  async owner(issuer: string, subject: string): Promise<string> {
    if (issuer !== "https://accounts.google.com" && issuer !== "accounts.google.com") throw new Error("identity issuer is invalid");
    if (!subject || subject.length > 255) throw new Error("identity subject is invalid");
    const result = await this.pool.query<{ owner_id: string }>(
      `INSERT INTO omni_chat.owners(owner_id,issuer,subject) VALUES ($1,$2,$3)
       ON CONFLICT (issuer,subject) DO UPDATE SET last_seen_at=now() RETURNING owner_id`,
      [randomUUID(), "https://accounts.google.com", subject]);
    return result.rows[0].owner_id;
  }

  async createThread(ownerId: string, input: ThreadInput, key: string): Promise<Record<string, unknown>> {
    if (input.parentThreadId) {
      const parent = await this.thread(ownerId,input.parentThreadId);
      if (parent.runtime !== input.runtime || parent.model !== input.model) {
        throw new ChatConflict("fork must keep parent runtime and model");
      }
    }
    const bodyDigest = digest(input);
    const threadId = input.threadId || randomUUID();
    const result = await this.pool.query(
      `INSERT INTO omni_chat.threads(owner_id,thread_id,runtime,model,assistant_profile,skill_profile,parent_thread_id,create_key,create_digest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (owner_id,create_key) DO NOTHING RETURNING *`,
      [ownerId,threadId,input.runtime,input.model,input.assistantProfile,input.skillProfile ?? null,input.parentThreadId ?? null,key,bodyDigest]);
    const row = result.rows[0] ?? (await this.pool.query(
      `SELECT * FROM omni_chat.threads WHERE owner_id=$1 AND create_key=$2`, [ownerId,key])).rows[0];
    if (!row || row.create_digest !== bodyDigest) throw new ChatConflict("thread idempotency key conflicts");
    return row;
  }

  async threads(ownerId: string): Promise<Record<string, unknown>[]> {
    return (await this.pool.query(`SELECT * FROM omni_chat.threads WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 100`, [ownerId])).rows;
  }

  async thread(ownerId: string, threadId: string): Promise<Record<string, unknown>> {
    const row = (await this.pool.query(`SELECT * FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2`, [ownerId,threadId])).rows[0];
    if (!row) throw new ChatNotFound("thread not found");
    return row;
  }

  async message(ownerId: string, threadId: string, content: string, key: string): Promise<Record<string, unknown>> {
    const bodyDigest = digest({ content });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const thread = (await client.query(
        `SELECT * FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2 AND status='ACTIVE' FOR UPDATE`,
        [ownerId,threadId])).rows[0];
      if (!thread) throw new ChatNotFound("active thread not found");
      const previous = (await client.query(
        `SELECT * FROM omni_chat.turns WHERE owner_id=$1 AND thread_id=$2 AND message_key=$3`,
        [ownerId,threadId,key])).rows[0];
      if (previous) {
        if (previous.message_digest !== bodyDigest) throw new ChatConflict("message idempotency key conflicts");
        await client.query("COMMIT");
        return { thread, turn: previous, dispatch: { status: previous.status } };
      }
      const turnId = randomUUID();
      const turn = (await client.query(
        `INSERT INTO omni_chat.turns(owner_id,thread_id,turn_id,message_key,message_digest)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`, [ownerId,threadId,turnId,key,bodyDigest])).rows[0];
      const seq = Number((await client.query(
        `SELECT COALESCE(MAX(seq),-1)+1 AS seq FROM omni_chat.events WHERE owner_id=$1 AND thread_id=$2`,
        [ownerId,threadId])).rows[0].seq);
      const event = (await client.query(
        `INSERT INTO omni_chat.events(owner_id,thread_id,turn_id,event_id,seq,event_type,payload)
         VALUES ($1,$2,$3,$4,$5,'item_upsert',$6) RETURNING *`,
        [ownerId,threadId,turnId,randomUUID(),seq,JSON.stringify({ role: "user", content })])).rows[0];
      await client.query(`UPDATE omni_chat.threads SET updated_at=now() WHERE owner_id=$1 AND thread_id=$2`, [ownerId,threadId]);
      await client.query("COMMIT");
      return { thread, turn, event, dispatch: { status: "QUEUED" } };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async events(ownerId: string, threadId: string, cursor: number, limit: number): Promise<Record<string, unknown>[]> {
    await this.thread(ownerId,threadId);
    return (await this.pool.query(
      `SELECT event_id,turn_id,seq,event_type,payload,item_id,provider_ids,created_at
       FROM omni_chat.events WHERE owner_id=$1 AND thread_id=$2 AND seq>$3 ORDER BY seq LIMIT $4`,
      [ownerId,threadId,cursor,limit])).rows;
  }

  async cancelQueuedTurn(ownerId: string, threadId: string, turnId: string): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const thread = (await client.query(
        `SELECT 1 FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2 FOR UPDATE`, [ownerId,threadId])).rows[0];
      if (!thread) throw new ChatNotFound("thread not found");
      const turn = (await client.query(
        `UPDATE omni_chat.turns SET status='CANCELLED',completed_at=now()
         WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3 AND status='QUEUED' RETURNING *`,
        [ownerId,threadId,turnId])).rows[0];
      if (!turn) throw new ChatConflict("only queued turns can be cancelled before runtime integration");
      const seq = Number((await client.query(
        `SELECT COALESCE(MAX(seq),-1)+1 AS seq FROM omni_chat.events WHERE owner_id=$1 AND thread_id=$2`,
        [ownerId,threadId])).rows[0].seq);
      await client.query(
        `INSERT INTO omni_chat.events(owner_id,thread_id,turn_id,event_id,seq,event_type,payload)
         VALUES ($1,$2,$3,$4,$5,'turn_cancelled',$6)`,
        [ownerId,threadId,turnId,randomUUID(),seq,JSON.stringify({ status:"cancelled" })]);
      await client.query("COMMIT");
      return turn;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async appendEvent(ownerId: string, threadId: string, turnId: string, eventId: string,
                    type: string, payload: unknown): Promise<Record<string, unknown>> {
    const safePayload = safeRecord(payload);
    if (Buffer.byteLength(JSON.stringify(safePayload)) > 65_536) throw new Error("event payload is too large");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const thread = (await client.query(
        `SELECT 1 FROM omni_chat.threads WHERE owner_id=$1 AND thread_id=$2 FOR UPDATE`,
        [ownerId,threadId])).rows[0];
      const turn = (await client.query(
        `SELECT status FROM omni_chat.turns WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3`,
        [ownerId,threadId,turnId])).rows[0];
      if (!thread || !turn) throw new ChatNotFound("turn not found");
      const previous = (await client.query(
        `SELECT * FROM omni_chat.events WHERE owner_id=$1 AND thread_id=$2 AND event_id=$3`,
        [ownerId,threadId,eventId])).rows[0];
      if (previous) {
        if (previous.turn_id !== turnId || previous.event_type !== type || digest(previous.payload) !== digest(safePayload)) {
          throw new ChatConflict("event id conflicts");
        }
        await client.query("COMMIT");
        return previous;
      }
      if (!["QUEUED", "RUNNING"].includes(turn.status)) throw new ChatConflict("turn is terminal");
      const seq = Number((await client.query(
        `SELECT COALESCE(MAX(seq),-1)+1 AS seq FROM omni_chat.events WHERE owner_id=$1 AND thread_id=$2`,
        [ownerId,threadId])).rows[0].seq);
      const row = (await client.query(
        `INSERT INTO omni_chat.events(owner_id,thread_id,turn_id,event_id,seq,event_type,payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [ownerId,threadId,turnId,eventId,seq,type,JSON.stringify(safePayload)])).rows[0];
      const status = type === "turn_completed" ? "COMPLETED" : type === "turn_cancelled" ? "CANCELLED" :
        type === "turn_error" ? "ERROR" : "RUNNING";
      await client.query(`UPDATE omni_chat.turns SET status=$4::varchar,completed_at=CASE WHEN $4::varchar IN ('COMPLETED','CANCELLED','ERROR') THEN now() ELSE completed_at END
        WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3`, [ownerId,threadId,turnId,status]);
      await client.query("COMMIT");
      return row;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async requestApproval(request: ApprovalInput): Promise<Record<string, unknown>> {
    const expiresAt = Date.parse(request.expiresAt);
    if (!Number.isFinite(expiresAt)) throw new Error("approval expiry is invalid");
    authorizeApproval({ ...request, scope: "turn_sandbox", expiresAt }, request);
    const result = await this.pool.query(
      `INSERT INTO omni_chat.approvals(owner_id,thread_id,turn_id,request_id,operation,params_digest,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (owner_id,thread_id,turn_id,request_id) DO NOTHING RETURNING *`,
      [request.ownerId,request.threadId,request.turnId,request.requestId,request.operation,request.paramsDigest,request.expiresAt]);
    const row = result.rows[0] ?? (await this.pool.query(
      `SELECT * FROM omni_chat.approvals WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3 AND request_id=$4`,
      [request.ownerId,request.threadId,request.turnId,request.requestId])).rows[0];
    if (!row || row.operation !== request.operation || row.params_digest !== request.paramsDigest ||
        new Date(row.expires_at).getTime() !== new Date(request.expiresAt).getTime()) {
      throw new ChatConflict("approval binding conflicts");
    }
    return row;
  }

  async decideApproval(ownerId: string, threadId: string, turnId: string, requestId: string,
                       paramsDigest: string, approved: boolean): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `UPDATE omni_chat.approvals SET status=$6,resolved_at=now()
       WHERE owner_id=$1 AND thread_id=$2 AND turn_id=$3 AND request_id=$4
         AND params_digest=$5 AND status='PENDING' AND expires_at>now() RETURNING *`,
      [ownerId,threadId,turnId,requestId,paramsDigest,approved ? "APPROVED" : "DENIED"]);
    if (!result.rows[0]) throw new ChatConflict("approval expired, resolved, or binding changed");
    return result.rows[0];
  }
}
