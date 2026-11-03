import { GoogleAuth } from "google-auth-library";
import { createHash } from "node:crypto";
import { MAX_ARTIFACT_BYTES } from "./artifacts.js";
import { type ArchiveWriter, type ArchiveWriterRequest, validateSnapshotReceipt } from "./archive.js";
import {serviceTargetMatches} from "../agent-gateway/service_target.js";

export function makeArchiveWriter(config:Record<string,unknown>):ArchiveWriter {
  if(config.approved!==true || typeof config.url!=="string" || typeof config.audience!=="string") throw new Error("approved archive writer configuration required");
  return makeArchiveWriterClient({url:config.url,audience:config.audience,approved:true});
}

export function approvedServiceOrigin(value:string):string {
  const url=new URL(value);
  if(url.protocol!=="https:" || url.username || url.password || url.port || url.pathname!=="/" || url.search || url.hash ||
    !/^[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(url.hostname) && !/^[a-z0-9-]+-\w+\.a\.run\.app$/.test(url.hostname)) throw new Error("invalid approved Cloud Run service origin");
  return url.origin;
}
export function makeArchiveWriterClient(config:{url:string;audience:string;approved:true},auth=new GoogleAuth(),request:typeof fetch=fetch):ArchiveWriter {
  if(config.approved!==true) throw new Error("archive writer approval missing");
  const origin=approvedServiceOrigin(config.url);
  if(!serviceTargetMatches(origin,config.audience)) throw new Error("archive writer audience must match the approved service origin");
  return async(input:ArchiveWriterRequest,signal:AbortSignal):Promise<unknown>=>{
    if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.exportId) ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.ownerId) ||
      !/^[a-f0-9]{64}$/.test(input.sourceSha256) || !/^[A-Za-z][A-Za-z0-9_]{0,62}\.[A-Za-z][A-Za-z0-9_]{0,62}\.[A-Za-z][A-Za-z0-9_]{0,62}$/.test(input.table)) throw new Error("invalid archive writer request");
    if(input.operation!=="commit"&&input.operation!=="lookup") throw new Error("invalid archive writer operation");
    if(input.operation==="commit") {
      if(typeof input.bytesBase64!=="string"||input.bytesBase64.length>Math.ceil(MAX_ARTIFACT_BYTES/3)*4 || typeof input.contentType!=="string"||
        !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(input.contentType)) throw new Error("invalid archive payload");
      const bytes=Buffer.from(input.bytesBase64,"base64");
      if(bytes.length>MAX_ARTIFACT_BYTES||bytes.toString("base64")!==input.bytesBase64||createHash("sha256").update(bytes).digest("hex")!==input.sourceSha256)
        throw new Error("archive payload digest mismatch");
    }
    const client=await auth.getIdTokenClient(config.audience);
    const token=await client.idTokenProvider.fetchIdToken(config.audience);
    const suffix=input.operation==="lookup"?`/${input.exportId}?ownerId=${encodeURIComponent(input.ownerId)}`:"";
    const response=await request(origin+"/v1/iceberg/exports"+suffix,{method:input.operation==="lookup"?"GET":"POST",
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Idempotency-Key":input.exportId},
      body:input.operation==="commit"?JSON.stringify(input):undefined,
      signal:AbortSignal.any([signal,AbortSignal.timeout(60_000)]),redirect:"error"});
    if(input.operation==="lookup"&&response.status===404) {await response.body?.cancel();return null;}
    if(!response.ok || !response.body) {await response.body?.cancel();throw new Error("approved archive writer unavailable or commit uncertain");}
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    try {for(;;) {const {done,value}=await reader.read();if(done) break;size+=value.length;if(size>8192) throw new Error("archive receipt too large");chunks.push(value);}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const receipt:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return validateSnapshotReceipt(receipt,input);
  };
}
