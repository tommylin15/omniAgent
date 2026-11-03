import {describe,expect,it} from "vitest";
import {chooseGeminiRoute,type GeminiRouteInput} from "../services/agent-gateway/gemini_route_policy.js";

const base:GeminiRouteInput={
  profile:"public-lite",trustedClass:"public",ownerModelAuthorized:true,
  model:"gemini-3.5-flash-lite",
  paidRoutingDeployed:false,paidKeyConfigured:false,
  paidTierVerified:false,providerModelVerified:false,
  budgetReservationVerified:false
};
describe("Paid Gemini selector is offline and explicit",()=>{
  it("keeps existing publicly authorized Lite route without a paid key",()=>{
    expect(chooseGeminiRoute(base)).toEqual({
      model:"gemini-3.5-flash-lite",credentialRef:"legacy-lite"
    });
  });
  it("never sends private data down a public Lite route",()=>{
    expect(()=>chooseGeminiRoute({...base,trustedClass:"private"}))
      .toThrow("private_data_requires_paid_route");
  });
  it("requires every paid gate and exact Owner entitlement",()=>{
    const paid:GeminiRouteInput={...base,profile:"private-lite",trustedClass:"private"};
    expect(()=>chooseGeminiRoute(paid)).toThrow("paid_gemini_route_not_verified");
    const all={...paid,paidRoutingDeployed:true,paidKeyConfigured:true,
      paidTierVerified:true,providerModelVerified:true,budgetReservationVerified:true};
    for(const gate of ["paidRoutingDeployed","paidKeyConfigured",
      "paidTierVerified","providerModelVerified","budgetReservationVerified"] as const){
      expect(()=>chooseGeminiRoute({...all,[gate]:false})).toThrow();
    }
    expect(()=>chooseGeminiRoute({...all,ownerModelAuthorized:false}))
      .toThrow("gemini_model_not_entitled");
    expect(chooseGeminiRoute(all).credentialRef).toBe("paid-gemini");
  });
  it("allows advanced Flash only on explicitly verified paid route",()=>{
    const paid:GeminiRouteInput={...base,profile:"advanced-flash",
      model:"gemini-2.5-flash",paidModelAllowlist:new Set(["gemini-2.5-flash"]),paidRoutingDeployed:true,paidKeyConfigured:true,
      paidTierVerified:true,providerModelVerified:true,budgetReservationVerified:true};
    expect(chooseGeminiRoute(paid)).toEqual({
      model:"gemini-2.5-flash",credentialRef:"paid-gemini"});
    expect(()=>chooseGeminiRoute({...paid,model:"gemini-2.5-pro"})).toThrow();
    expect(()=>chooseGeminiRoute({...base,ownerModelAuthorized:false})).toThrow();
  });
});
