import { describe,expect,it } from "vitest";
import { verifyGoogleBrowserUserClaims } from "../services/chat-api/google_user_identity.js";

const person = {
  iss:"https://accounts.google.com",
  sub:"10999888777666555",
  email:"approved.user@example.com",
  email_verified:true,
  azp:"123456789012-abcdef.apps.googleusercontent.com",
};

describe("R05 Google signed IAM principals must never be browser Owners",()=>{
  it("accepts verified human Google browser claim shape only after signature verifier",()=>{
    expect(()=>verifyGoogleBrowserUserClaims(person)).not.toThrow();
    expect(()=>verifyGoogleBrowserUserClaims({...person,azp:undefined})).not.toThrow();
    expect(()=>verifyGoogleBrowserUserClaims({...person,iss:"accounts.google.com"})).not.toThrow();
  });
  it.each([
    {email:"robot@example.iam.gserviceaccount.com",azp:"107517467455664443765"},
    {email:"ROBOT@PROJECT.IAM.GSERVICEACCOUNT.COM",azp:undefined},
    {email:"robot@example.iam.gserviceaccount.com",azp:person.azp},
    {email:undefined,azp:"107517467455664443765"},
    {email:undefined,azp:undefined},
    {email:"approved.user@example.com",azp:"107517467455664443765"},
    {email:"approved.user@example.com",azp:"https://accounts.google.com"},
    {email:"approved.user@example.com",email_verified:false},
    {email:"approved.user@example.com",email_verified:undefined},
    {email:"approved.user@example.com",sub:""},
    {email:"approved.user@example.com",iss:"custom.google.issuer"},
  ])("rejects signed non-browser claim pattern: %#", (overrides)=>{
    expect(()=>verifyGoogleBrowserUserClaims({...person,...overrides})).toThrow("unauthorized");
  });
});
