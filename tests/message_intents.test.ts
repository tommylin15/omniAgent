import {describe,it,expect,vi} from "vitest";
import {MessageIntentStore,MessageIntentConflict,MessageIntentNotFound,messageIntentDigest,
  requirePreparedMessageIntent,consumeMessageIntent} from "../services/chat-api/message_intents.js";
const owner="11111111-1111-4111-8111-111111111111",thread="22222222-2222-4222-8222-222222222222";
const key="33333333-3333-4333-8333-333333333333",turn="44444444-4444-4444-8444-444444444444";
const content="private fixture text";
const prepared={idempotency_key:key,content_digest:messageIntentDigest(content),state:"prepared",turn_id:null};
function fixture(rows:Array<{rows?:unknown[];rowCount?:number}>){
  const queue=[...rows];
  const query=vi.fn(async(sql:string,_values?:unknown[])=>{
    if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return {rows:[],rowCount:0};
    const result=queue.shift();if(!result)throw Error("unexpected_query");return {rows:result.rows??[],rowCount:result.rowCount??result.rows?.length??0};
  });
  const release=vi.fn();const pool={connect:vi.fn(async()=>({query,release}))};
  return {store:new MessageIntentStore(pool as never),query,release};
}
describe("durable message intent handoff",()=>{
  it("reads a cancelled key tombstone for another device's recovery",async()=>{
    const f=fixture([{rowCount:1},{rows:[{...prepared,state:"cancelled"}]}]);
    expect(await f.store.read(owner,"thread-with-public-id",key)).toMatchObject({key,state:"cancelled"});
    expect(f.query.mock.calls[2][1]).toEqual([owner,"thread-with-public-id",key]);
  });
  it("stores only a content hash and locks the thread before checking concurrent intents",async()=>{
    const f=fixture([{rowCount:1},{rows:[]},{rows:[]},{rows:[prepared]}]);
    expect(await f.store.prepare(owner,thread,key,content)).toEqual({key,contentDigest:prepared.content_digest,state:"prepared",turnId:null});
    expect(f.query.mock.calls[1][0]).toContain("threads");expect(f.query.mock.calls[1][0]).toContain("FOR UPDATE");
    const insert=f.query.mock.calls.find(([sql])=>sql.startsWith("INSERT"))!;
    expect(insert[1]).toEqual([owner,thread,key,prepared.content_digest]);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain(content);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");expect(f.release).toHaveBeenCalledOnce();
  });
  it("same key has immutable content and cancelled keys never revive",async()=>{
    for(const row of [{...prepared,content_digest:messageIntentDigest("other")},{...prepared,state:"cancelled"}]){
      const f=fixture([{rowCount:1},{rows:[row]}]);
      await expect(f.store.prepare(owner,thread,key,content)).rejects.toBeInstanceOf(MessageIntentConflict);
      expect(f.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
      expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    }
  });
  it("same prepared key recovers its receipt without another insertion",async()=>{
    const f=fixture([{rowCount:1},{rows:[prepared]}]);
    expect((await f.store.prepare(owner,thread,key,content)).key).toBe(key);
    expect(f.query).toHaveBeenCalledTimes(4);
  });
  it("a prepared or active billable turn blocks another device's fresh key",async()=>{
    const f=fixture([{rowCount:1},{rows:[]},{rowCount:1}]);
    await expect(f.store.prepare(owner,thread,key,content)).rejects.toBeInstanceOf(MessageIntentConflict);
    expect(f.query.mock.calls[3][0]).toContain("status IN ('QUEUED','RUNNING')");
    expect(f.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
  });
  it("cross-owner/missing thread fails before reading any intent",async()=>{
    const f=fixture([{rowCount:0}]);
    await expect(f.store.active(owner,thread)).rejects.toBeInstanceOf(MessageIntentNotFound);
    expect(f.query.mock.calls[1][1]).toEqual([owner,thread]);
    expect(f.query.mock.calls.some(([sql])=>sql.includes("FROM omni_chat.message_intents"))).toBe(false);
  });
  it("cancel cannot race past a consumed turn and prepared cancel preserves its tombstone",async()=>{
    const f=fixture([{rowCount:1},{rows:[{...prepared,state:"consumed",turn_id:turn}]}]);
    await expect(f.store.cancel(owner,thread,key)).rejects.toBeInstanceOf(MessageIntentConflict);
    expect(f.query.mock.calls.some(([sql])=>sql.startsWith("UPDATE"))).toBe(false);
    const cancelled={...prepared,state:"cancelled"};
    const second=fixture([{rowCount:1},{rows:[prepared]},{rows:[cancelled]}]);
    expect((await second.store.cancel(owner,thread,key)).state).toBe("cancelled");
    expect(second.query.mock.calls[3][0]).toContain("AND state='prepared'");
  });
  it("message transaction must consume exact prepared digest; late cancelled POST is denied",async()=>{
    const query=vi.fn().mockResolvedValueOnce({rows:[{...prepared,state:"cancelled"}],rowCount:1});
    await expect(requirePreparedMessageIntent({query} as never,owner,thread,key,content)).rejects.toBeInstanceOf(MessageIntentConflict);
    query.mockResolvedValueOnce({rows:[prepared],rowCount:1});
    await requirePreparedMessageIntent({query} as never,owner,thread,key,content);
    query.mockResolvedValueOnce({rows:[],rowCount:1});
    await consumeMessageIntent({query} as never,owner,thread,key,content,turn);
    expect(query.mock.calls.at(-1)?.[1]).toEqual([owner,thread,key,prepared.content_digest,turn]);
    expect(query.mock.calls.at(-1)?.[0]).toContain("AND state='prepared'");
    query.mockResolvedValueOnce({rows:[],rowCount:0});
    await expect(consumeMessageIntent({query} as never,owner,thread,key,content,turn)).rejects.toBeInstanceOf(MessageIntentConflict);
  });
});
