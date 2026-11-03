import {GoogleAuth} from "google-auth-library";
import {serviceTargetMatches} from "./service_target.js";

export type CredentialExecution={ownerId:string;threadId:string;turnId:string;
  runtime:"gemini"|"openrouter"|"groq";credentialProfileId:string};
export async function resolveExecutionCredential(input:CredentialExecution,deps:{enabled:boolean;
  lookup:(input:CredentialExecution)=>Promise<string>;access:(reference:string)=>Promise<string>}):Promise<string>{
  if(!deps.enabled||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.ownerId)||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.credentialProfileId)||
    !["gemini","openrouter","groq"].includes(input.runtime))throw Error("byok_execution_unavailable");
  const reference=await deps.lookup(input);
  const key=await deps.access(reference);
  if(typeof key!=="string"||key.length<16||Buffer.byteLength(key)>4096||key.trim()!==key||/[\r\n\0]/.test(key))
    throw Error("byok_execution_unavailable");
  return key;
}

// No cache: a revoked profile must fail its next execution lookup.
export function credentialLookupFromEnvironment(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
  const target=new URL(env.BYOK_CHAT_URL??"");
  const audience=env.BYOK_CHAT_AUDIENCE;
  if(target.protocol!=="https:"||target.pathname!=="/"||target.username||target.password||target.search||target.hash||
    typeof audience!=="string"||!serviceTargetMatches(target.toString(),audience))throw Error("byok_chat_target_invalid");
  const auth=new GoogleAuth();
  return async(input:CredentialExecution):Promise<string>=>{
    const client=await auth.getIdTokenClient(audience);
    const token=await client.idTokenProvider.fetchIdToken(audience);
    const response=await fetcher(new URL("/internal/v1/chat/credentials:resolve",target),{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({...input,provider:input.runtime})});
    if(!response.ok)throw Error("byok_execution_unavailable");
    const raw=await response.text();
    if(Buffer.byteLength(raw)>2048)throw Error("byok_execution_unavailable");
    const value=JSON.parse(raw) as Record<string,unknown>;
    if(typeof value.reference!=="string")throw Error("byok_execution_unavailable");
    return value.reference;
  };
}
