import {describe,it,expect,vi} from "vitest";
import {resolveExecutionCredential} from "../services/agent-gateway/credential_resolution.js";
describe("execution credential resolution",()=>{
  const input={ownerId:"11111111-1111-4111-8111-111111111111",threadId:"thread",turnId:"turn",
    runtime:"gemini" as const,credentialProfileId:"22222222-2222-4222-8222-222222222222"};
  it("does not infer BYOK permission from a configured platform key",async()=>{
    const lookup=vi.fn(),access=vi.fn();
    await expect(resolveExecutionCredential(input,{enabled:false,lookup,access})).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();expect(access).not.toHaveBeenCalled();
  });
  it("rechecks the exact Owner/provider/profile before every access",async()=>{
    const lookup=vi.fn(async()=>"projects/test-project/secrets/omniagent-byok-22222222222242228222222222222222/versions/1");
    const access=vi.fn(async()=>"fixture-private-value");
    expect(await resolveExecutionCredential(input,{enabled:true,lookup,access})).toBe("fixture-private-value");
    expect(lookup).toHaveBeenCalledWith(input);expect(access).toHaveBeenCalledOnce();
    lookup.mockRejectedValueOnce(new Error("revoked"));
    await expect(resolveExecutionCredential(input,{enabled:true,lookup,access})).rejects.toThrow();
    expect(access).toHaveBeenCalledOnce();
  });
});
