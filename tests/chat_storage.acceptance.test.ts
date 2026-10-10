import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { ChatConflict, ChatNotFound, ChatStore } from "../services/chat-api/storage.js";
import { ChatDispatcher, makeSignedGatewayInvoker } from "../services/chat-api/gateway_dispatch.js";
import { makeChatServer } from "../services/chat-api/server.js";
import { makeServer } from "../services/agent-gateway/server.js";
import { parseModelEntitlements } from "../services/chat-api/model_entitlements.js";
import type { AddressInfo } from "node:net";
import { CredentialRegistry } from "../services/chat-api/credential_management.js";

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
      for (const filename of ["001_chat_ownership.sql", "002_skill_storage.sql", "003_credential_metadata.sql"]) {
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
      // FR-013: a credential reference is not a credential value. The
      // registry is owner-bound and cannot resolve PENDING/REVOKING/REVOKED.
      const credentials=new CredentialRegistry(pool);
      const profile="00000000-0000-4000-8000-000000000091";
      const ref="projects/test-project/secrets/omniagent-byok-"+profile.replace(/-/g,"")+"/versions/1";
      await credentials.reserve(a,profile,"gemini",ref);
      expect((await credentials.list(a)).map(row=>row.status)).toEqual(["PENDING"]);
      expect(await credentials.list(b)).toEqual([]);
      expect(JSON.stringify(await credentials.list(a))).not.toContain("secret_version");
      await expect(credentials.resolveRef(a,"gemini",profile)).rejects.toBeInstanceOf(ChatNotFound);
      await expect(credentials.activate(b,profile)).rejects.toBeInstanceOf(ChatConflict);
      expect((await credentials.activate(a,profile)).status).toBe("ACTIVE");
      expect(await credentials.resolveRef(a,"gemini",profile)).toBe(ref);
      await expect(credentials.resolveRef(b,"gemini",profile)).rejects.toBeInstanceOf(ChatNotFound);
      await expect(credentials.resolveRef(a,"openrouter",profile)).rejects.toBeInstanceOf(ChatNotFound);
      await expect(credentials.beginRevoke(b,profile)).rejects.toBeInstanceOf(ChatNotFound);
      expect((await credentials.beginRevoke(a,profile)).status).toBe("REVOKING");
      await expect(credentials.resolveRef(a,"gemini",profile)).rejects.toBeInstanceOf(ChatNotFound);
      expect((await credentials.finalizeRevoke(a,profile)).status).toBe("REVOKED");

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

      // Two claimants exercise real PostgreSQL row locks, not mocked queues.
      // Claims are derived exclusively from durable owner/thread/turn rows.
      const bobThread = await store.createThread(b,{ ...input,threadId:"thread-b" },"bob-create");
      expect(bobThread.thread_id).toBe("thread-b");
      const aliceQueued = await store.message(a,"thread-a","dispatch alice","dispatch-alice");
      const bobQueued = await store.message(b,"thread-b","dispatch bob","dispatch-bob");
      const [claimOne,claimTwo] = await Promise.all([
        store.claimNextQueuedTurn([a,b]),store.claimNextQueuedTurn([a,b])
      ]);
      expect(claimOne).not.toBeNull();
      expect(claimTwo).not.toBeNull();
      expect(new Set([claimOne!.turnId,claimTwo!.turnId])).toEqual(
        new Set([aliceQueued.turn.turn_id,bobQueued.turn.turn_id])
      );
      const observed = new Map([claimOne!,claimTwo!].map(c => [c.ownerId,c]));
      expect(observed.get(a)).toMatchObject({
        ownerId:a,threadId:"thread-a",runtime:"gemini",model:"test-model",
        content:"dispatch alice"
      });
      expect(observed.get(b)).toMatchObject({
        ownerId:b,threadId:"thread-b",runtime:"gemini",model:"test-model",
        content:"dispatch bob"
      });
      expect(await store.claimNextQueuedTurn([a,b])).toBeNull();
      const statuses = await pool.query(`
        SELECT owner_id,status FROM omni_chat.turns
        WHERE turn_id=ANY($1::varchar[])`, [[claimOne!.turnId,claimTwo!.turnId]]);
      expect(statuses.rows).toHaveLength(2);
      expect(statuses.rows.every(row => row.status === "RUNNING")).toBe(true);
      // No automatic replay of in-flight provider effects after a crash.
      expect(await store.claimNextQueuedTurn([a,b])).toBeNull();

      // Read-only diagnostics expose only old RUNNING identifiers from
      // explicitly approved owners, never prompts or other owners' rows.
      await pool.query(`UPDATE omni_chat.turns SET created_at=now()-interval '11 minutes'
        WHERE owner_id=$1 AND turn_id=$2`,[a,observed.get(a)!.turnId]);
      const candidates=await store.runningReconciliationCandidates([a]);
      expect(candidates.some(row=>row.turn_id===observed.get(a)!.turnId)).toBe(true);
      expect(candidates.every(row=>row.owner_id===a && row.status==="RUNNING")).toBe(true);
      expect(JSON.stringify(candidates)).not.toContain("dispatch alice");
      expect(JSON.stringify(candidates)).not.toContain("dispatch bob");
      expect(await store.runningReconciliationCandidates([])).toEqual([]);

      // A worker may only claim the exact allowlisted owner/runtime/model.
      // A denied model stays QUEUED and must never be sent to a provider.
      await store.createThread(a,{...input,threadId:"model-denied",model:"unlisted-model"},"denied-create");
      const blockedTurn=await store.message(a,"model-denied","do not invoke","denied-message");
      const rules=[{ownerId:a,runtime:"gemini" as const,model:"test-model",
        credentialMode:"platform" as const}];
      expect(await store.claimNextQueuedTurn([a],undefined,rules)).toBeNull();
      expect((await pool.query(
        "SELECT status FROM omni_chat.turns WHERE owner_id=$1 AND thread_id='model-denied'",
        [a])).rows[0].status).toBe("QUEUED");
      await store.createThread(a,{...input,threadId:"model-allowed"},"allowed-create");
      const allowedTurn=await store.message(a,"model-allowed","model explicitly allowed","allowed-message");
      expect(await store.claimNextQueuedTurn([a],undefined,rules)).toMatchObject({
        ownerId:a,threadId:"model-allowed",turnId:allowedTurn.turn.turn_id,
        model:"test-model",runtime:"gemini"
      });
      expect(await store.claimNextQueuedTurn([a],undefined,rules)).toBeNull();
      expect((await pool.query(
        "SELECT status FROM omni_chat.turns WHERE owner_id=$1 AND thread_id='model-denied'",
        [a])).rows[0].status).toBe("QUEUED");
      expect(blockedTurn.turn.status).toBe("QUEUED");
      // Leave the shared test fixture queue clean for the subsequent test
      // sections; the denial above has already been checked on the database.
      expect((await store.cancelQueuedTurn(a,"model-denied",String(blockedTurn.turn.turn_id))).status)
        .toBe("CANCELLED");

      // Real ephemeral Postgres persists Gateway replies under the claimed
      // owner only. The provider is stubbed: GCP live integration is separate.
      const pending=await store.message(b,"thread-b","gateway hello","gateway-1");
      expect(await store.claimNextQueuedTurn([a])).toBeNull();
      const executor=new ChatDispatcher(store,async task => ({events:[
        {type:"text_delta",threadId:task.threadId,turnId:task.turnId,
          payload:{text:"assistant reply"}},
        {type:"turn_completed",threadId:task.threadId,turnId:task.turnId,
          payload:{status:"completed"}}
      ]}),[b]);
      expect(await executor.runOnce()).toMatchObject({
        status:"completed",turnId:pending.turn.turn_id
      });
      expect(await executor.runOnce()).toMatchObject({status:"idle"});
      expect((await store.events(b,"thread-b",-1,200)).map(row=>row.event_type))
        .toEqual(["item_upsert","item_upsert","text_delta","turn_completed"]);
      await expect(store.events(a,"thread-b",-1,200)).rejects.toBeInstanceOf(ChatNotFound);
      await expect(store.appendEvent(a,"thread-b",pending.turn.turn_id as string,
        "foreign","text_delta",{text:"not allowed"})).rejects.toBeInstanceOf(ChatNotFound);

      // An entire Gateway response must be visible atomically: a database
      // failure on the second event rolls back the first and leaves RUNNING
      // for explicit reconciliation, never a partial streamed answer.
      await store.createThread(a,{...input,threadId:"atomic-thread"},"atomic-create");
      const atomicQueued = await store.message(a,"atomic-thread","atomic prompt","atomic-message");
      const atomicId = String(atomicQueued.turn.turn_id);
      expect(await store.claimNextQueuedTurn([a],{
        ownerId:a,threadId:"atomic-thread",turnId:atomicId
      })).toMatchObject({ownerId:a,threadId:"atomic-thread",turnId:atomicId});
      const batch = [
        {eventId:"gateway-atomic-success",type:"text_delta",payload:{text:"你好"}},
        {eventId:"gateway-atomic-fail",type:"turn_completed",payload:{status:"completed"}}
      ];
      await pool.query(`ALTER TABLE omni_chat.events ADD CONSTRAINT reject_atomic_second
        CHECK (event_id <> 'gateway-atomic-fail')`);
      try {
        await expect(store.appendGatewayEvents(a,"atomic-thread",atomicId,batch))
          .rejects.toMatchObject({code:"23514"});
        const partial = await store.events(a,"atomic-thread",-1,200);
        expect(partial.map(row=>row.event_type)).toEqual(["item_upsert"]);
        expect((await pool.query(`SELECT status FROM omni_chat.turns WHERE
          owner_id=$1 AND thread_id='atomic-thread' AND turn_id=$2`,[a,atomicId])).rows[0].status)
          .toBe("RUNNING");
      } finally {
        await pool.query("ALTER TABLE omni_chat.events DROP CONSTRAINT reject_atomic_second");
      }
      await store.appendGatewayEvents(a,"atomic-thread",atomicId,batch);
      const committed = await store.events(a,"atomic-thread",-1,200);
      expect(committed.map(row=>row.event_type)).toEqual(
        ["item_upsert","text_delta","turn_completed"]);
      expect(committed.map(row=>Number(row.seq))).toEqual([0,1,2]);
      expect(committed[1].payload).toEqual({text:"你好"});
      expect((await pool.query(`SELECT status FROM omni_chat.turns WHERE
        owner_id=$1 AND thread_id='atomic-thread' AND turn_id=$2`,[a,atomicId])).rows[0].status)
        .toBe("COMPLETED");
      await expect(store.appendGatewayEvents(a,"atomic-thread",atomicId,batch))
        .rejects.toBeInstanceOf(ChatConflict);
      await expect(store.appendGatewayEvents(b,"atomic-thread",atomicId,batch))
        .rejects.toBeInstanceOf(ChatNotFound);
      await expect(store.appendGatewayEvents(a,"atomic-thread",atomicId,[
        {eventId:"gateway-invalid-secret",type:"turn_error",payload:{api_key:"never-store"}}
      ])).rejects.toThrow("credential");
      expect((await store.events(a,"atomic-thread",-1,200))).toHaveLength(3);

      const disposable = await store.createThread(a,{...input,threadId:"delete-me"},"delete-create");
      await store.message(a,String(disposable.thread_id),"永久刪除測試","delete-message");
      const running = await store.claimNextQueuedTurn([a], {ownerId:a,threadId:"delete-me",turnId:String((await store.message(a,"delete-me","永久刪除測試","delete-message")).turn.turn_id)});
      expect(running?.threadId).toBe("delete-me");
      await expect(store.deleteThread(a,"delete-me")).rejects.toBeInstanceOf(ChatConflict);
      await store.appendEvent(a,"delete-me",running!.turnId,"delete-completed","turn_completed",{status:"complete"});
      await store.createThread(a,{...input,threadId:"kept-fork",parentThreadId:"delete-me"},"fork-create");
      await expect(store.deleteThread(b,"delete-me")).rejects.toBeInstanceOf(ChatNotFound);
      await store.deleteThread(a,"delete-me");
      await expect(store.thread(a,"delete-me")).rejects.toBeInstanceOf(ChatNotFound);
      expect((await store.thread(a,"kept-fork")).parent_thread_id).toBeNull();
      for (const table of ["threads","turns","events","approvals"]) {
        expect((await pool.query(`SELECT count(*) AS n FROM omni_chat.${table} WHERE owner_id=$1 AND thread_id=$2`,[a,"delete-me"])).rows[0].n).toBe("0");
      }

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

      // True disposable PostgreSQL + both HTTP servers + signed HMAC
      // + Owner capability endpoint + replay. Stubbed provider never bills.
      const priorSigning = process.env.MCP_OWNER_SIGNING_KEY;
      const signingKey = "0123456789abcdef0123456789abcdef";
      process.env.MCP_OWNER_SIGNING_KEY = signingKey;
      let requests = 0;
      const gateway = makeServer(undefined,undefined,undefined,async request => {
        requests++;
        return {events:[
          { ownerId:request.ownerId,threadId:request.threadId,turnId:request.turnId,
            type:"text_delta",payload:{text:"bounded fixture answer"} },
          { ownerId:request.ownerId,threadId:request.threadId,turnId:request.turnId,
            type:"turn_completed",payload:{status:"completed"} }
        ]};
      });
      let chat: ReturnType<typeof makeChatServer> | undefined;
      try {
        await new Promise<void>(resolve=>gateway.listen(0,"127.0.0.1",resolve));
        const gatewayLocal = "http://127.0.0.1:"+(gateway.address() as AddressInfo).port;
        const invoker = makeSignedGatewayInvoker({
          url:"https://approved-private-gateway.example.com",
          audience:"https://approved-gateway.example.com",
          signingKey,
          idToken:async()=>"fixture-signed-service-only",
          fetcher: ((target: RequestInfo | URL,init?: RequestInit) =>
            fetch(gatewayLocal+new URL(String(target)).pathname,init)) as typeof fetch
        });
        const entitlements = parseModelEntitlements(JSON.stringify([
          {ownerId:a,runtime:"gemini",model:"gemini-3.5-flash-lite",credentialMode:"platform"}
        ]),[a]);
        const worker = new ChatDispatcher(store,invoker,[a],entitlements);
        chat = makeChatServer(store,async token => {
          if (!["alice","bob"].includes(token)) throw new Error("unauthorized");
          return {issuer:"https://accounts.google.com",subject:token};
        },async token => {if(token!=="service")throw new Error("unauthorized");},worker);
        await new Promise<void>(resolve=>chat!.listen(0,"127.0.0.1",resolve));
        const url = "http://127.0.0.1:"+(chat.address() as AddressInfo).port;
        const auth = (owner: string) => ({Authorization:"Bearer "+owner,
          "Content-Type":"application/json"});
        expect((await fetch(url+"/v1/models")).status).toBe(401);
        expect(await (await fetch(url+"/v1/models",{headers:auth("alice")})).json())
          .toEqual({dispatchEnabled:true,items:[{runtime:"gemini",model:"gemini-3.5-flash-lite"}]});
        expect(await (await fetch(url+"/v1/models",{headers:auth("bob")})).json())
          .toEqual({dispatchEnabled:false,items:[]});
        const threadResponse=await fetch(url+"/v1/threads",{
          method:"POST",headers:{...auth("alice"),"Idempotency-Key":"joined-create-1"},
          body:JSON.stringify({runtime:"gemini",model:"gemini-3.5-flash-lite",
            threadId:"joined-flow",assistantProfile:"default"})});
        expect(threadResponse.status).toBe(201);
        expect((await threadResponse.json()).owner_id).toBe(a);
        const messageResponse=await fetch(url+"/v1/threads/joined-flow/messages",{
          method:"POST",headers:{...auth("alice"),"Idempotency-Key":"joined-message-1"},
          body:JSON.stringify({content:"owner-only fixture prompt"})});
        expect(messageResponse.status).toBe(202);
        expect((await messageResponse.json()).dispatch.status).toBe("completed");
        expect(requests).toBe(1);
        const replay=await fetch(url+"/v1/threads/joined-flow/events?cursor=-1",{
          headers:auth("alice")});
        expect(replay.status).toBe(200);
        const stream=await replay.text();
        expect(stream).toContain("event: text_delta");
        expect(stream).toContain("bounded fixture answer");
        expect(stream).toContain("event: turn_completed");
        expect((await fetch(url+"/v1/threads/joined-flow/events?cursor=-1",{
          headers:auth("bob")})).status).toBe(404);
        expect((await fetch(url+"/v1/threads/joined-flow/messages",{
          method:"POST",headers:{...auth("bob"),"Idempotency-Key":"foreign-1"},
          body:JSON.stringify({content:"cross-owner request"})})).status).toBe(404);
        expect(requests).toBe(1);
        const replayFromCursor=await fetch(url+"/v1/threads/joined-flow/events?cursor=1",{
          headers:auth("alice")});
        const resumed=await replayFromCursor.text();
        expect(resumed).not.toContain("owner-only fixture prompt");
        expect(resumed).toContain("turn_completed");
      } finally {
        if (chat) await new Promise<void>(resolve=>chat!.close(()=>resolve()));
        await new Promise<void>(resolve=>gateway.close(()=>resolve()));
        if (priorSigning === undefined) delete process.env.MCP_OWNER_SIGNING_KEY;
        else process.env.MCP_OWNER_SIGNING_KEY=priorSigning;
      }
    } finally { await pool.end(); }
  },60_000);
});
