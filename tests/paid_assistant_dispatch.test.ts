import {afterEach,describe,it,expect,vi} from "vitest";
import {dispatchAssistant} from "../services/agent-gateway/assistant_dispatch.js";
const request={ownerId:"11111111-1111-4111-8111-111111111111",threadId:"22222222-2222-4222-8222-222222222222",
  turnId:"33333333-3333-4333-8333-333333333333",runtime:"gemini" as const,model:"gemini-2.5-flash",
  routeProfile:"advanced-flash" as const,messages:[{role:"user" as const,content:"hello"}]};
afterEach(()=>vi.unstubAllEnvs());
describe("paid Chat requires an explicit backend profile and exact Owner/model entitlement",()=>{
  it("does not infer paid permission from platform key, model name or another Owner",async()=>{
    vi.stubEnv("GEMINI_PAID_OWNER_MODELS_JSON",JSON.stringify({"44444444-4444-4444-8444-444444444444":[request.model]}));
    await expect(dispatchAssistant(request)).rejects.toThrow("not_entitled");
    vi.stubEnv("GEMINI_PAID_OWNER_MODELS_JSON",JSON.stringify({[request.ownerId]:["gemini-2.5-flash-lite"]}));
    await expect(dispatchAssistant(request)).rejects.toThrow("not_entitled");
  });
  it("never sends paid profiles through BYOK or unpriced grounding",async()=>{
    vi.stubEnv("GEMINI_PAID_OWNER_MODELS_JSON",JSON.stringify({[request.ownerId]:[request.model]}));
    await expect(dispatchAssistant({...request,credentialProfileId:"55555555-5555-4555-8555-555555555555"})).rejects.toThrow("unavailable");
    await expect(dispatchAssistant({...request,grounding:true})).rejects.toThrow("UNKNOWN");
  });
});
