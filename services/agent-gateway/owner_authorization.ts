import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

// The consumer must derive ownerId from an independently authenticated user
// and its own database authorization. The signed proof authenticates that
// assertion; it is not a substitute for the consumer's owner-policy checks.
type Binding = Readonly<{ project:string; ownerId:string; requestId:string; audience:string }>;
const HEX = /^[a-f0-9]{64,128}$/i;
const PROOF = /^v1=([a-f0-9]{64})$/;
const MAX_DRIFT_MS = 60_000;

export function parseOwnerAuthorizationKeys(raw:string, projects:readonly string[]):Map<string,string> {
  let parsed:unknown;
  try { parsed=JSON.parse(raw); } catch { throw new Error("owner_authorization_config_invalid"); }
  if (!parsed || typeof parsed!=="object" || Array.isArray(parsed))
    throw new Error("owner_authorization_config_invalid");
  const entries=Object.entries(parsed as Record<string,unknown>);
  if (entries.length!==projects.length ||
      entries.some(([name,key])=>!projects.includes(name)||typeof key!=="string"||!HEX.test(key)) ||
      new Set(entries.map(([,key])=>key)).size!==entries.length)
    throw new Error("owner_authorization_config_invalid");
  return new Map(entries.map(([project,key])=>[project,key as string]));
}
function digest(key:string,binding:Binding,timestamp:string):Buffer {
  const message=[binding.project,binding.ownerId.toLowerCase(),binding.requestId.toLowerCase(),
    binding.audience,timestamp].join("\n");
  return createHmac("sha256",Buffer.from(key,"hex")).update(message).digest();
}
export function signOwnerAuthorization(binding:Binding,key:string,timestamp:number):Record<string,string> {
  if (!HEX.test(key) || !Number.isSafeInteger(timestamp)) throw new Error("invalid_owner_signing_input");
  const value=String(timestamp);
  return {"x-omniagent-owner-timestamp":value,
    "x-omniagent-owner-authorization":"v1="+digest(key,binding,value).toString("hex")};
}
export function verifyOwnerAuthorization(headers:IncomingHttpHeaders,binding:Binding,
  keys:ReadonlyMap<string,string>,now=Date.now()):boolean {
  const timestamp=headers["x-omniagent-owner-timestamp"];
  const proof=headers["x-omniagent-owner-authorization"];
  const key=keys.get(binding.project);
  if (typeof timestamp!=="string" || !/^\d{13}$/.test(timestamp) ||
      typeof proof!=="string" || !PROOF.test(proof) || !key || !HEX.test(key))
    return false;
  const then=Number(timestamp);
  if (!Number.isSafeInteger(then) || Math.abs(now-then)>MAX_DRIFT_MS) return false;
  const supplied=Buffer.from(PROOF.exec(proof)![1],"hex");
  const expected=digest(key,binding,timestamp);
  return supplied.length===expected.length && timingSafeEqual(supplied,expected);
}
