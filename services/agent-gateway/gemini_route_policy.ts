/**
 * OA-GEMINI-02 offline policy contract. This is NOT live paid-model dispatch:
 * no key bytes, billing calls or provider requests cross this module.
 * Legacy Chat/Shared Gateway Lite allowlist remains unchanged.
 */
export type GeminiRouteProfile="public-lite"|"private-lite"|"advanced-flash";
export type GeminiTrustClass="public"|"private";
export type GeminiRouteInput={
  profile:GeminiRouteProfile;
  trustedClass:GeminiTrustClass;
  ownerModelAuthorized:boolean;
  model:string;
  paidRoutingDeployed:boolean;
  paidKeyConfigured:boolean;
  paidTierVerified:boolean;
  providerModelVerified:boolean;
  budgetReservationVerified:boolean;
  paidModelAllowlist?:ReadonlySet<string>;
};
export type GeminiRouteSelection={model:string;credentialRef:"legacy-lite"|"paid-gemini"};
const lite=new Set(["gemini-3.5-flash-lite","gemini-3.1-flash-lite","gemini-2.5-flash-lite"]);
export function chooseGeminiRoute(input:GeminiRouteInput):GeminiRouteSelection {
  if(!input.ownerModelAuthorized)throw new Error("gemini_model_not_entitled");
  if(input.trustedClass!=="public"&&input.trustedClass!=="private")
    throw new Error("untrusted_data_classification");
  if(input.profile==="public-lite") {
    if(input.trustedClass!=="public")throw new Error("private_data_requires_paid_route");
    if(!lite.has(input.model))throw new Error("unsupported_public_lite_model");
    return {model:input.model,credentialRef:"legacy-lite"};
  }
  if(input.profile!=="private-lite"&&input.profile!=="advanced-flash")
    throw new Error("unknown_gemini_route");
  if(input.profile==="private-lite"&&!(input.paidModelAllowlist?
    /^gemini-[a-z0-9.-]+-flash-lite(?:-[a-z0-9.-]+)?$/.test(input.model):lite.has(input.model)))
    throw new Error("unsupported_private_lite_model");
  if(input.paidModelAllowlist&&!input.paidModelAllowlist.has(input.model))
    throw new Error("paid_model_not_configured");
  if(input.profile==="advanced-flash"&&(!input.paidModelAllowlist||
    !/^gemini-[a-z0-9.-]+-flash(?:-[a-z0-9.-]+)?$/.test(input.model)||input.model.includes("flash-lite")))
    throw new Error("unsupported_advanced_flash_model");
  if(!input.paidRoutingDeployed||!input.paidKeyConfigured||
    !input.paidTierVerified||!input.providerModelVerified||
    !input.budgetReservationVerified)
    throw new Error("paid_gemini_route_not_verified");
  return {model:input.model,credentialRef:"paid-gemini"};
}
