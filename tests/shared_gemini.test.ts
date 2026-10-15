import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSharedGeminiHandler, parseGeminiCallers, parseSharedGeminiRequest } from "../services/agent-gateway/shared_gemini.js";
import { GeminiProviderError, type GeminiResult } from "../services/agent-gateway/gemini_provider.js";
import { signOwnerAuthorization } from "../services/agent-gateway/owner_authorization.js";

const ids={ownerId:"00000000-0000-4000-8000-000000000001",requestId:"00000000-0000-4000-8000-000000000002"};
const sa={omniagent:"omniagent-codex-chat-client@p.iam.gserviceaccount.com",
  "market-mart":"omniagent-codex-market-client@p.iam.gserviceaccount.com",
  "life-assistant":"omniagent-codex-life-client@p.iam.gserviceaccount.com"};
const env={GEMINI_SHARED_EXECUTION_ENABLED:"true",GEMINI_SHARED_AUDIENCE:"https://gateway.example.run.app",
  GEMINI_SHARED_CALLERS_JSON:JSON.stringify(sa),GEMINI_API_KEY:"mock-key",GEMINI_SHARED_MODEL:"gemini-3.5-flash-lite"};
const base={...ids,project:"omniagent",prompt:"Reply with OK"};
const answer:GeminiResult={text:"OK",model:"gemini-3.5-flash-lite",queriedAt:"2026-10-13T00:00:00Z",
  searchQueries:[],citations:[],usage:{promptTokens:5,candidateTokens:1,totalTokens:6}};
let server:Server|undefined;
afterEach(async()=>{
  if (server) {await new Promise<void>((resolve,reject)=>server!.close((error)=>error?reject(error):resolve()));server=undefined;}
});
async function serve(handler: ReturnType<typeof makeSharedGeminiHandler>):Promise<string>{
  server=createServer(handler).listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server!.once("listening",resolve));
  const address=server.address();
  if (!address || typeof address==="string") throw new Error("missing address");
  return "http://127.0.0.1:"+address.port+"/v1/gemini/execute";
}
const post=(url:string,body:unknown,authorization="Bearer test")=>
  fetch(url,{method:"POST",headers:{authorization,"content-type":"application/json"},body:JSON.stringify(body)});
describe("Shared Gateway Gemini vertical slice",()=>{
  it("accepts exactly three distinct project identities and bounded Flash-Lite only",()=>{
    expect([...parseGeminiCallers(JSON.stringify(sa)).keys()]).toEqual(["omniagent","market-mart","life-assistant"]);
    for(const invalid of ["{}",JSON.stringify({...sa,unauthorized:sa.omniagent}),
      JSON.stringify({...sa,omniagent:sa["market-mart"]}),JSON.stringify({...sa,omniagent:"plain-email"})]){
      expect(()=>parseGeminiCallers(invalid)).toThrow();
    }
    expect(parseSharedGeminiRequest(base,"gemini-3.5-flash-lite").model).toBe("gemini-3.5-flash-lite");
    for(const x of [{...base,model:"gemini-3.5-flash"},{...base,model:"gemini-3.5-pro"},
      {...base,prompt:""}, {...base,prompt:"多".repeat(11_000)},
      {...base,ownerId:"foreign"},{...base,requestId:"bad"},
      {...base,privateKey:"leak"},{...base,project:"forged"}]){
      expect(()=>parseSharedGeminiRequest(x,"gemini-3.5-flash-lite")).toThrow();
    }
  });
  it("allows a full ~30KB market-mart CEO prompt without enlarging the other projects",()=>{
    const ceoPrompt="五".repeat(9_995)+"OK"; // 29,987 UTF-8 bytes
    expect(Buffer.byteLength(ceoPrompt,"utf8")).toBe(29_987);
    expect(parseSharedGeminiRequest({...base,project:"market-mart",prompt:ceoPrompt},
      "gemini-3.5-flash-lite").prompt).toBe(ceoPrompt);
    expect(()=>parseSharedGeminiRequest({...base,project:"life-assistant",prompt:ceoPrompt},
      "gemini-3.5-flash-lite")).toThrow("invalid_request");
    expect(()=>parseSharedGeminiRequest({...base,project:"omniagent",prompt:ceoPrompt},
      "gemini-3.5-flash-lite")).toThrow("invalid_request");
    expect(parseSharedGeminiRequest({...base,project:"market-mart",prompt:"x".repeat(32_768)},
      "gemini-3.5-flash-lite").prompt).toHaveLength(32_768);
    for(const invalid of ["x".repeat(32_769),"五".repeat(10_923)]){
      expect(()=>parseSharedGeminiRequest({...base,project:"market-mart",prompt:invalid},
        "gemini-3.5-flash-lite")).toThrow("invalid_request");
    }
    expect(()=>parseSharedGeminiRequest({...base,project:"life-assistant",prompt:"a".repeat(8_193)},
      "gemini-3.5-flash-lite")).toThrow("invalid_request");
  });
  it("passes a real 29,987-byte CEO request through HTTP, including Python-escaped CJK JSON",async()=>{
    const ceoPrompt="五".repeat(9_995)+"OK";
    const verify=vi.fn(async()=>sa["market-mart"]);
    const generate=vi.fn(async()=>answer);
    const url=await serve(makeSharedGeminiHandler({env,verify,generate}));
    const accepted=await post(url,{...base,project:"market-mart",prompt:ceoPrompt});
    expect(accepted.status).toBe(200);
    expect((await accepted.json())).toMatchObject({status:"completed",project:"market-mart",
      result:{text:"OK"}});
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(ceoPrompt,"gemini-3.5-flash-lite",2048);
    // Python's default ensure_ascii=True doubles the wire size of CJK text.
    // The decoded prompt still consumes only 29,987 UTF-8 bytes.
    const escapedBody=JSON.stringify({...base,project:"market-mart",prompt:ceoPrompt})
      .replace(/五/g,"\\u4e94");
    expect(Buffer.byteLength(escapedBody,"utf8")).toBeGreaterThan(48*1024);
    expect(Buffer.byteLength(escapedBody,"utf8")).toBeLessThan(128*1024);
    const encoded=await fetch(url,{method:"POST",headers:{
      authorization:"Bearer test","content-type":"application/json"},body:escapedBody});
    expect(encoded.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenLastCalledWith(ceoPrompt,"gemini-3.5-flash-lite",2048);
    // Raw decoded prompt is still <32KiB, but escaped control characters
    // inflate an envelope above 128KiB; reject before model invocation.
    const oversizedBody=await post(url,{...base,project:"market-mart",
      prompt:"\u0000".repeat(30_000)});
    expect(oversizedBody.status).toBe(400);
    expect(await oversizedBody.json()).toEqual({error:"invalid_request"});
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("binds output token budget to authenticated project, not prompt or model choice",async()=>{
    const generate=vi.fn(async()=>answer);
    const verify=vi.fn(async(token:string)=>sa[token as keyof typeof sa]||"");
    const url=await serve(makeSharedGeminiHandler({env,verify,generate}));
    // A market-mart bearer cannot claim to be Life to circumvent either cap.
    const forged=await post(url,{...base,project:"market-mart"},"Bearer life-assistant");
    expect(forged.status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
    const normal=await post(url,{...base,project:"market-mart"},"Bearer market-mart");
    expect(normal.status).toBe(200);
    expect(generate).toHaveBeenCalledExactlyOnceWith("Reply with OK","gemini-3.5-flash-lite",2048);
  });
  it("strict mode rejects unsigned, forged, expired or wrong-owner proof before paid model execution",async()=>{
    const signingKeys={omniagent:"a".repeat(64),"market-mart":"b".repeat(64),
      "life-assistant":"c".repeat(64)};
    const audience=env.GEMINI_SHARED_AUDIENCE;
    const strictEnv={...env,GEMINI_SHARED_REQUIRE_OWNER_AUTHORIZATION:"true",
      GEMINI_SHARED_OWNER_AUTHORIZATION_KEYS_JSON:JSON.stringify(signingKeys)};
    const generate=vi.fn(async()=>answer);
    const endpoint=await serve(makeSharedGeminiHandler({env:strictEnv,
      verify:async()=>sa.omniagent,generate}));
    const unsigned=await post(endpoint,base);
    expect(unsigned.status).toBe(403);
    expect(await unsigned.json()).toEqual({error:"owner_authorization_required"});
    expect(generate).not.toHaveBeenCalled();
    const signed=signOwnerAuthorization({...base,audience},signingKeys.omniagent,Date.now());
    const invoke=async(body:unknown,headers:Record<string,string>)=>
      fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer ok",
        "Content-Type":"application/json",...headers},body:JSON.stringify(body)});
    const forged=await invoke({...base,ownerId:"00000000-0000-4000-8000-000000000003"},signed);
    expect(forged.status).toBe(403);
    const expired=signOwnerAuthorization({...base,audience},signingKeys.omniagent,Date.now()-65_000);
    expect((await invoke(base,expired)).status).toBe(403);
    const valid=await invoke(base,signed);
    expect(valid.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("stays OFF by default and rejects unsafe enablement",async()=>{
    const url=await serve(makeSharedGeminiHandler({env:{}}));
    expect((await post(url,base)).status).toBe(404);
    for(const bad of [{...env,GEMINI_SHARED_AUDIENCE:"http://example.test"},
      {...env,GEMINI_API_KEY:""},{...env,GEMINI_PAID_ENABLED:"true"},
      {...env,GEMINI_SHARED_MODEL:"gemini-3.5-pro"}]){
      expect(()=>makeSharedGeminiHandler({env:bad})).toThrow();
    }
  });
  it("authenticates first, binds caller to project, returns bounded answer for all three",async()=>{
    const verify=vi.fn(async(token:string)=>sa[token as keyof typeof sa]||"");
    const generate=vi.fn(async()=>answer);
    const url=await serve(makeSharedGeminiHandler({env,verify,generate}));
    const noAuth=await post(url,base,"");
    expect(noAuth.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
    const invalid=await post(url,base,"Bearer forged");
    expect(invalid.status).toBe(403);
    for (const project of ["omniagent","market-mart","life-assistant"] as const) {
      const body={...base,project};
      const res=await post(url,body,"Bearer "+project);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({status:"completed",project,...ids,model:answer.model,
        result:{text:"OK"},usage:answer.usage});
    }
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate).toHaveBeenNthCalledWith(1,"Reply with OK","gemini-3.5-flash-lite",512);
    expect(generate).toHaveBeenNthCalledWith(2,"Reply with OK","gemini-3.5-flash-lite",2048);
    expect(generate).toHaveBeenNthCalledWith(3,"Reply with OK","gemini-3.5-flash-lite",512);
    expect(verify).toHaveBeenCalledWith("life-assistant",env.GEMINI_SHARED_AUDIENCE);
    const cross=await post(url,{...base,project:"life-assistant"},"Bearer omniagent");
    expect(cross.status).toBe(403);
    expect(generate).toHaveBeenCalledTimes(3);
  });
  it("distinguishes output exhaustion, blocked candidates, provider errors and timeout without leaking content",async()=>{
    const answers:GeminiResult[]=[
      {...answer,text:"{\"incomplete\":",finishReason:"MAX_TOKENS"},
      {...answer,text:"",blockReason:"SAFETY"},
      {...answer,text:"blocked",finishReason:"SAFETY"},
      {...answer,text:"partial",finishReason:"OTHER"},
      {...answer,text:"x".repeat(32_001)},
    ];
    const causes=[
      ...answers,
      new GeminiProviderError("provider_error",400),
      new GeminiProviderError("provider_unavailable",503),
      Object.assign(new Error("secret timeout"),{name:"TimeoutError"}),
    ];
    const expected=[
      ["output_limit",502,undefined,false],
      ["safety_blocked",502,undefined,false],
      ["safety_blocked",502,undefined,false],
      ["model_stopped",502,undefined,false],
      ["response_too_large",502,undefined,false],
      ["provider_rejected",502,400,false],
      ["provider_unavailable",503,503,true],
      ["provider_timeout",504,undefined,true],
    ] as const;
    const generate=vi.fn(async()=>{
      const value=causes.shift();
      if(value instanceof Error)throw value;
      return value!;
    });
    const url=await serve(makeSharedGeminiHandler({env,verify:async()=>sa.omniagent,generate}));
    for(const [reason,status,upstreamStatus,transient] of expected){
      const res=await post(url,base);
      expect(res.status).toBe(status);
      const result=await res.json();
      expect(result).toEqual({status:"failed",requestId:base.requestId,
        error:"gemini_execution_failed",reason,
        ...(upstreamStatus?{upstreamStatus}:{}),
        ...(transient?{transient:true}:{})});
      expect(JSON.stringify(result)).not.toContain("secret");
    }
    expect(generate).toHaveBeenCalledTimes(expected.length);
  });
  it("separates upstream 503 from 429 quota and 502/504, without implicit retry",async()=>{
    const errors=[
      new GeminiProviderError("provider_unavailable",503),
      new GeminiProviderError("provider_unavailable",500),
      new GeminiProviderError("provider_unavailable",502),
      new GeminiProviderError("provider_unavailable",504),
      new GeminiProviderError("provider_error",408),
      new GeminiProviderError("provider_error",401),
      new TypeError("provider transport problem"),
      new SyntaxError("invalid provider JSON"),
    ];
    const expectations=[
      [503,"provider_unavailable",503,true],
      [502,"provider_unavailable",500,true],
      [502,"provider_unavailable",502,true],
      [504,"provider_timeout",504,true],
      [504,"provider_timeout",408,true],
      [502,"provider_rejected",401,false],
      [502,"provider_network_error",undefined,true],
      [502,"provider_invalid_response",undefined,false],
    ] as const;
    const generate=vi.fn(async()=>{
      const failure=errors.shift();
      if(failure)throw failure;
      return answer;
    });
    const url=await serve(makeSharedGeminiHandler({env,verify:async()=>sa["market-mart"],generate}));
    for(const [http,reason,upstreamStatus,transient] of expectations){
      const res=await post(url,{...base,project:"market-mart"});
      expect(res.status).toBe(http);
      expect(await res.json()).toEqual({
        status:"failed",requestId:base.requestId,
        error:"gemini_execution_failed",reason,
        ...(upstreamStatus?{upstreamStatus}:{}),
        ...(transient?{transient:true}:{})
      });
    }
    expect(generate).toHaveBeenCalledTimes(expectations.length);
    // An explicit new request can recover; the failed call is never replayed.
    const recovered=await post(url,{...base,project:"market-mart",
      requestId:"00000000-0000-4000-8000-000000000003"});
    expect(recovered.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(expectations.length+1);
    expect(generate).toHaveBeenLastCalledWith("Reply with OK","gemini-3.5-flash-lite",2048);
  });
  it("fails closed without exposing private output/provider exceptions",async()=>{
    const verify=vi.fn(async()=>sa.omniagent);
    const generate=vi.fn().mockRejectedValueOnce(new GeminiProviderError("quota",429))
      .mockRejectedValueOnce(new Error("SENSITIVE-TOKEN-KEY"))
      .mockResolvedValueOnce({...answer,text:""});
    const url=await serve(makeSharedGeminiHandler({env,verify,generate}));
    for(const [status,code,reason] of [[429,"gemini_quota",undefined],
      [502,"gemini_execution_failed","unexpected_failure"],
      [502,"gemini_execution_failed","empty_model_reply"]] as const){
      const res=await post(url,base);
      expect(res.status).toBe(status);
      const body=await res.json();
      expect(body).toMatchObject({error:code,requestId:base.requestId,status:"failed"});
      expect(body).toEqual({...body,...(reason?{reason}:{})});
      if(reason)expect(body.reason).toBe(reason);
      else expect(body).not.toHaveProperty("reason");
      expect(JSON.stringify(body)).not.toContain("SENSITIVE");
    }
  });
});
