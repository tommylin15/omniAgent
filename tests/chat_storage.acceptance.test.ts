import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { ChatConflict, ChatNotFound, ChatStore } from "../services/chat-api/storage.js";

const dsn = process.env.PG_TEST_URL;
describe.runIf(Boolean(dsn))("isolated PostgreSQL ChatStore acceptance", () => {
  it("applies migrations twice and verifies durable owner, thread, event, approval, and skill boundaries", async () => {
    const url = new URL(dsn!);
    if (!(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/omniagent_acceptance")) {
      throw new Error("acceptance requires local ephemeral omniagent_acceptance DB");
    }
    const pool = new Pool({ connectionString: dsn, connectionTimeoutMillis: 3_000 });
    try {
      expect((await pool.query("SELECT current_database() AS name")).rows[0].name).toBe("omniagent_acceptance");
      expect((await pool.query("SELECT to_regclass('omni_chat.owners') AS present")).rows[0].present).toBeNull();
      for (const filename of ["001_chat_ownership.sql", "002_skill_storage.sql"]) {
        const sql = readFileSync("infra/postgres/migrations/" + filename,"utf8");
        await pool.query(sql);
        await pool.query(sql);
      }
      const absent = await pool.query(`SELECT to_regclass(name) AS present FROM unnest($1::text[]) AS names(name)`, [[
        "private.assistant_threads","private.assistant_turns","private.assistant_event_index",
        "private.assistant_skill_revisions"]]);
      expect(absent.rows.every((row) => row.present === null)).toBe(true);

      const store = new ChatStore(pool);
      const a = await store.owner("accounts.google.com","alice");
      const b = await store.owner("https://accounts.google.com","bob");
      expect(await store.owner("https://accounts.google.com","alice")).toBe(a);
      expect(b).not.toBe(a);
      const input = { threadId:"thread-a", runtime:"gemini" as const, model:"test-model", assistantProfile:"default" };
      const thread = await store.createThread(a,input,"create-1");
      expect(thread.thread_id).toBe("thread-a");
      expect((await store.createThread(a,input,"create-1")).thread_id).toBe("thread-a");
      await expect(store.createThread(a,{ ...input, model:"different" },"create-1")).rejects.toBeInstanceOf(ChatConflict);
      expect((await store.threads(a)).length).toBe(1);
      expect((await store.thread(a,"thread-a")).model).toBe("test-model");
      await expect(store.thread(b,"thread-a")).rejects.toBeInstanceOf(ChatNotFound);
      await expect(pool.query(`INSERT INTO omni_chat.turns(owner_id,thread_id,turn_id,message_key,message_digest)
        VALUES ($1,'thread-a','foreign-turn','key','sha256:${"a".repeat(64)}')`,[b])).rejects.toMatchObject({ code:"23503" });

      const first = await store.message(a,"thread-a","hello","message-1");
      const turnId = first.turn.turn_id as string;
      expect(first.turn.status).toBe("QUEUED");
      expect(first.event.seq).toBe("0");
      expect((await store.message(a,"thread-a","hello","message-1")).turn.turn_id).toBe(turnId);
      await expect(store.message(a,"thread-a","different","message-1")).rejects.toBeInstanceOf(ChatConflict);
      await expect(store.message(b,"thread-a","hello","message-1")).rejects.toBeInstanceOf(ChatNotFound);
      const appended = await store.appendEvent(a,"thread-a",turnId,"event-1","text_delta",{ text:"world" });
      expect(Number(appended.seq)).toBe(1);
      expect((await store.events(a,"thread-a",-1,200)).map((row) => Number(row.seq))).toEqual([0,1]);
      await expect(store.events(b,"thread-a",-1,200)).rejects.toBeInstanceOf(ChatNotFound);
      await expect(store.appendEvent(a,"thread-a",turnId,"event-secret","text_delta",
        { nested:[{ refresh_token:"secret" }] })).rejects.toThrow("credential");

      const digest = "sha256:" + "b".repeat(64);
      const approval = await store.requestApproval({ ownerId:a,threadId:"thread-a",turnId,
        requestId:"approval-1",operation:"shell",paramsDigest:digest,
        expiresAt:new Date(Date.now()+60_000).toISOString() });
      expect(approval.status).toBe("PENDING");
      await expect(store.decideApproval(b,"thread-a",turnId,"approval-1",digest,true)).rejects.toBeInstanceOf(ChatConflict);
      await expect(store.decideApproval(a,"thread-a",turnId,"approval-1","sha256:"+"c".repeat(64),true)).rejects.toBeInstanceOf(ChatConflict);
      expect((await store.decideApproval(a,"thread-a",turnId,"approval-1",digest,true)).status).toBe("APPROVED");
      const queued = await store.message(a,"thread-a","second","message-2");
      expect((await store.cancelQueuedTurn(a,"thread-a",queued.turn.turn_id as string)).status).toBe("CANCELLED");
      await expect(store.cancelQueuedTurn(b,"thread-a",queued.turn.turn_id as string)).rejects.toBeInstanceOf(ChatNotFound);

      const content = { prompt:"summarize", required_tools:[], workflow:[] };
      const skill = await store.writeSkillRevision(a,"summary",1,content,"skill-1");
      expect(skill.content_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect((await store.readSkillRevision(a,"summary",1)).content).toEqual(content);
      expect((await store.skillState(a,"summary")).current_revision).toBe(1);
      expect((await store.setSkillState(a,"summary",false)).enabled).toBe(false);
      expect((await store.writeSkillRevision(a,"summary",1,content,"skill-1")).content_digest).toBe(skill.content_digest);
      expect((await store.skillState(a,"summary")).enabled).toBe(false);
      await expect(store.writeSkillRevision(a,"summary",1,{ prompt:"changed" },"skill-1")).rejects.toBeInstanceOf(ChatConflict);
      await expect(store.writeSkillRevision(a,"summary",1,content,"different-key")).rejects.toBeInstanceOf(ChatConflict);
      await expect(store.writeSkillRevision(a,"summary",2,{ prompt:"unsafe",workflow:[{ tool:"x",args:{ api_key:"secret" } }] },"skill-secret"))
        .rejects.toThrow("credential");
      await store.writeSkillRevision(a,"summary",2,{ prompt:"revised" },"skill-2");
      expect((await store.skillState(a,"summary")).current_revision).toBe(2);
      expect((await store.skillState(a,"summary")).enabled).toBe(false);
      expect((await store.setSkillState(a,"summary",true,1)).current_revision).toBe(1);
      await expect(store.readSkillRevision(b,"summary",1)).rejects.toBeInstanceOf(ChatNotFound);
      await expect(store.skillState(b,"summary")).rejects.toBeInstanceOf(ChatNotFound);
      await expect(pool.query(`UPDATE omni_chat.skill_revisions SET content='{}' WHERE owner_id=$1`,[a]))
        .rejects.toThrow("skill revisions are immutable");
      await store.writeSkillRevision(b,"summary",1,{ prompt:"bob's skill" },"skill-1");
      expect((await store.skillState(b,"summary")).current_revision).toBe(1);
    } finally { await pool.end(); }
  },60_000);
});
