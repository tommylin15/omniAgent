import {afterEach,describe,expect,it,vi} from "vitest";
import {dispatchAssistant} from "../services/agent-gateway/assistant_dispatch.js";
import {allowsModel,parseModelEntitlements} from "../services/chat-api/model_entitlements.js";

const owner="11111111-1111-4111-8111-111111111111";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Groq authenticated Chat path",()=>{
  it("requires an explicit Owner/model entitlement",()=>{
    const entries=parseModelEntitlements(JSON.stringify([{ownerId:owner,runtime:"groq",
      model:"llama-3.3-70b-versatile",credentialMode:"platform"}]),[owner]);
    expect(allowsModel(entries,owner,"groq","llama-3.3-70b-versatile")).toBe(true);
    expect(allowsModel(entries,"22222222-2222-4222-8222-222222222222","groq","llama-3.3-70b-versatile")).toBe(false);
  });
  it("emits durable Chat events from the enabled bounded provider",async()=>{
    vi.stubEnv("GROQ_EXECUTION_ENABLED","true");vi.stubEnv("GROQ_API_KEY","test-key-only");
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({model:"llama-3.3-70b-versatile",
      choices:[{message:{content:"hello"},finish_reason:"stop"}],
      usage:{prompt_tokens:2,completion_tokens:1,total_tokens:3}}),{status:200})));
    const result=await dispatchAssistant({ownerId:owner,threadId:"thread",turnId:"turn",
      runtime:"groq",model:"llama-3.3-70b-versatile",messages:[{role:"user",content:"hi"}]});
    expect(result).toMatchObject({events:[{type:"text_delta",payload:{text:"hello"}},
      {type:"turn_completed",payload:{usage:{totalTokens:3}}}]});
  });
  it("does not call the provider when disabled",async()=>{
    vi.stubEnv("GROQ_EXECUTION_ENABLED","false");vi.stubEnv("GROQ_API_KEY","test-key-only");
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await expect(dispatchAssistant({ownerId:owner,threadId:"thread",turnId:"turn",runtime:"groq",
      model:"llama-3.3-70b-versatile",messages:[{role:"user",content:"hi"}]})).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
