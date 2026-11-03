import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe,it,expect,vi } from "vitest";
import { ArtifactService,validateArtifactInput,type ArtifactRow } from "../services/chat-api/artifacts.js";
import { ArchiveService,validateSnapshotReceipt,validateAnalyticsConfig,BoundedAnalytics } from "../services/chat-api/archive.js";
import { makeArchiveWriterClient } from "../services/chat-api/archive_writer.js";

const owner="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",id="33333333-3333-4333-8333-333333333333";
const bytes=Buffer.from('{"report":"hello"}'),sha=createHash("sha256").update(bytes).digest("hex");
function artifactFixture(state="reserved") {
  const row:ArtifactRow={id,owner_id:owner,object_key:`owners/${owner}/artifacts/${id}`,sha256:sha,byte_length:String(bytes.length),content_type:"application/json",state,generation:state==="available"?"123":null};
  const query=vi.fn(async(sql:string,args?:unknown[])=>{
    if(sql.startsWith("SELECT")) return {rows:args?.[0]===owner?[{...row}]:[]};
    if(sql.startsWith("INSERT")) return {rows:[{...row}]};
    if(sql.includes("state=$3")) {row.state=String(args?.[2]);row.generation=String(args?.[3]);}
    else if(sql.includes("state='uncertain'")) row.state="uncertain";
    else if(sql.includes("state='uploading'")) row.state="uploading";
    return {rows:[],rowCount:1};
  });
  const objects={put:vi.fn(async()=>{}),get:vi.fn(async()=>({bytes,generation:"123"}))};
  return {row,query,objects,service:new ArtifactService({query} as unknown as Pool,objects,"a".repeat(32))};
}
describe("owner-bound durable artifacts",()=>{
  it("rejects digest and length violations before cloud writes",async()=>{
    const f=artifactFixture();const access=await f.service.signedAccess(owner,id,"upload");
    await expect(f.service.upload(owner,id,access.token,Buffer.from("wrong"))).rejects.toThrow("digest or length");
    expect(f.objects.put).not.toHaveBeenCalled();
    expect(()=>validateArtifactInput({idempotencyKey:"x",sha256:sha,byteLength:16_777_217,contentType:"text/plain"})).toThrow();
  });
  it("binds signatures to authenticated owner, artifact and operation",async()=>{
    const f=artifactFixture();const access=await f.service.signedAccess(owner,id,"upload");
    expect(access.path).toBe(`/v1/artifacts/${id}/upload`);
    await expect(f.service.upload(other,id,access.token,bytes)).rejects.toThrow("access denied");
    await expect(f.service.download(owner,id,access.token)).rejects.toThrow("access denied");
    expect(f.objects.put).not.toHaveBeenCalled();
  });
  it("records uncertain outcome after lost upload response and reconciles immutable generation",async()=>{
    const f=artifactFixture();f.objects.put.mockRejectedValueOnce(new Error("lost response"));
    const access=await f.service.signedAccess(owner,id,"upload");
    await expect(f.service.upload(owner,id,access.token,bytes)).rejects.toThrow("uncertain");
    expect(f.row.state).toBe("uncertain");
    await expect(f.service.reconcile(owner,id)).resolves.toEqual({state:"available"});
    const download=await f.service.signedAccess(owner,id,"download");
    expect((await f.service.download(owner,id,download.token)).bytes).toEqual(bytes);
    expect(f.objects.get).toHaveBeenLastCalledWith(f.row.object_key,"123");
  });
  it("rejects an existing cloud object with different content",async()=>{
    const f=artifactFixture();f.objects.get.mockResolvedValueOnce({bytes:Buffer.from("tampered"),generation:"123"});
    await expect(f.service.reconcile(owner,id)).resolves.toEqual({state:"rejected"});
  });
});
describe("verified Iceberg archive",()=>{
  const request={operation:"lookup" as const,exportId:id,ownerId:owner,sourceSha256:sha,table:"catalog.namespace.reports"};
  const receipt={format:"iceberg",exportId:id,ownerId:owner,sourceSha256:sha,table:request.table,snapshotId:"42",committed:true,recordCount:1};
  it("requires owner, source digest and actual snapshot receipt",()=>{
    expect(validateSnapshotReceipt(receipt,request).snapshotId).toBe("42");
    for(const change of [{format:"json"},{ownerId:other},{sourceSha256:"0".repeat(64)},{snapshotId:""},{committed:false}])
      expect(()=>validateSnapshotReceipt({...receipt,...change},request)).toThrow("snapshot receipt");
  });
  it("recovers existing committed snapshot without a duplicate write",async()=>{
    const artifacts=artifactFixture("available").service;
    const query=vi.fn(async()=>({rows:[{id,artifact_id:id,sha256:sha,table_name:request.table,state:"uncertain"}]}));
    const writer=vi.fn(async(_request:unknown,_signal:AbortSignal)=>receipt);
    const archive=new ArchiveService({query} as unknown as Pool,artifacts,{table:request.table,writer});
    await expect(archive.archive(owner,id,"export-1")).resolves.toMatchObject({state:"verified"});
    expect(writer).toHaveBeenCalledTimes(1);expect(writer.mock.calls[0][0]).toMatchObject({operation:"lookup"});
  });
  it("does not enable archive or analytics without explicit configuration",async()=>{
    const f=artifactFixture();
    await expect(new ArchiveService({} as Pool,f.service).archive(owner,id,"key")).rejects.toThrow("not configured");
    await expect(new BoundedAnalytics({} as Pool).query(owner,new Date().toISOString())).rejects.toThrow("not configured");
  });
  it("rejects unapproved analytics resources and budgets",()=>{
    const config={approved:true as const,project:"valid-project",dataset:"reports",table:"events",location:"asia-east1",maximumBytesBilled:1000,maxOwnerDailyQueries:2,maxGlobalDailyQueries:4};
    expect(()=>validateAnalyticsConfig(config)).not.toThrow();
    for(const change of [{project:"project` JOIN secrets"},{table:"x.y"},{maximumBytesBilled:1_073_741_825},{approved:false}])
      expect(()=>validateAnalyticsConfig({...config,...change} as typeof config)).toThrow();
  });
  it("refuses archive payload whose bytes do not match its receipt digest",async()=>{
    const writer=makeArchiveWriterClient({url:"https://writer-123.asia-east1.run.app",audience:"https://writer-123.asia-east1.run.app",approved:true});
    await expect(writer({...request,operation:"commit",contentType:"application/json",bytesBase64:Buffer.from("bad").toString("base64")},AbortSignal.timeout(1000))).rejects.toThrow("digest mismatch");
  });
});
