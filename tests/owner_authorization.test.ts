import { describe, expect, it } from "vitest";
import { parseOwnerAuthorizationKeys, signOwnerAuthorization, verifyOwnerAuthorization } from
  "../services/agent-gateway/owner_authorization.js";
const key="b".repeat(64);
const key2="c".repeat(64);
const binding={project:"omniagent",ownerId:"00000000-0000-4000-8000-000000000001",
  requestId:"00000000-0000-4000-8000-000000000002",audience:"https://gateway.example.test"};
function toHeaders(p:Record<string,string>) {return {...p};}
describe("owner authorization assertion",()=>{
  it("accepts only distinct exact caller keys",()=>{
    expect(()=>parseOwnerAuthorizationKeys("{}",["omniagent"])).toThrow();
    expect(()=>parseOwnerAuthorizationKeys(JSON.stringify({omniagent:"short"}),["omniagent"])).toThrow();
    expect(()=>parseOwnerAuthorizationKeys(JSON.stringify({omniagent:key,other:key}),
      ["omniagent","other"])).toThrow();
    expect(parseOwnerAuthorizationKeys(JSON.stringify({omniagent:key}),["omniagent"]).get("omniagent"))
      .toBe(key);
  });
  it("verifies exact owner, project, request, audience and freshness with HMAC",()=>{
    const now=1_700_000_000_000,keys=new Map([[binding.project,key]]);
    const headers=toHeaders(signOwnerAuthorization(binding,key,now));
    expect(verifyOwnerAuthorization(headers,binding,keys,now)).toBe(true);
    for(const patch of [{ownerId:"00000000-0000-4000-8000-000000000003"},
      {requestId:"00000000-0000-4000-8000-000000000004"},
      {project:"other"},{audience:"https://other.example.test"}])
      expect(verifyOwnerAuthorization(headers,{...binding,...patch},keys,now)).toBe(false);
    expect(verifyOwnerAuthorization(headers,binding,keys,now+60_001)).toBe(false);
    expect(verifyOwnerAuthorization({...headers,"x-omniagent-owner-authorization":"v1="+"0".repeat(64)},
      binding,keys,now)).toBe(false);
    expect(verifyOwnerAuthorization(headers,binding,new Map([[binding.project,key2]]),now)).toBe(false);
  });
});
