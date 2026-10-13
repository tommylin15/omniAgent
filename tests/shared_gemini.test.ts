import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSharedGeminiHandler, parseGeminiCallers, parseSharedGeminiRequest } from "../services/agent-gateway/shared_gemini.js";
import { GeminiProviderError, type GeminiResult } from "../services/agent-gateway/gemini_provider.js";

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
      {...base,prompt:""}, {...base,prompt:"多".repeat(3_000)},
      {...base,ownerId:"foreign"},{...base,requestId:"bad"},
      {...base,privateKey:"leak"},{...base,project:"forged"}]){
      expect(()=>parseSharedGeminiRequest(x,"gemini-3.5-flash-lite")).toThrow();
    }
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
    expect(verify).toHaveBeenCalledWith("life-assistant",env.GEMINI_SHARED_AUDIENCE);
    const cross=await post(url,{...base,project:"life-assistant"},"Bearer omniagent");
    expect(cross.status).toBe(403);
    expect(generate).toHaveBeenCalledTimes(3);
  });
  it("fails closed without exposing private output/provider exceptions",async()=>{
    const verify=vi.fn(async()=>sa.omniagent);
    const generate=vi.fn().mockRejectedValueOnce(new GeminiProviderError("quota",429))
      .mockRejectedValueOnce(new Error("SENSITIVE-TOKEN-KEY"))
      .mockResolvedValueOnce({...answer,text:""});
    const url=await serve(makeSharedGeminiHandler({env,verify,generate}));
    for(const [status,error] of [[429,"gemini_quota"],[502,"gemini_execution_failed"],[502,"gemini_execution_failed"]] as const){
      const res=await post(url,base);
      expect(res.status).toBe(status);
      const body=await res.text();
      expect(body).toContain(error);
      expect(body).not.toContain("SENSITIVE");
    }
  });
});
