import {GoogleAuth} from "google-auth-library";
import {credentialLookupFromEnvironment,resolveExecutionCredential,type CredentialExecution} from "./credential_resolution.js";

export async function executionKey(input:CredentialExecution,env:NodeJS.ProcessEnv=process.env,
  fetcher:typeof fetch=fetch):Promise<string>{
  try{return await resolveKey(input,env,fetcher);}catch{throw Error("byok_execution_unavailable");}
}
async function resolveKey(input:CredentialExecution,env:NodeJS.ProcessEnv,fetcher:typeof fetch):Promise<string>{
  const project=env.BYOK_SECRET_PROJECT;
  if(env.BYOK_EXECUTION_ENABLED!=="true"||!project||!/^[a-z][a-z0-9-]{4,62}$/.test(project))
    throw Error("byok_execution_unavailable");
  const auth=new GoogleAuth({scopes:["https://www.googleapis.com/auth/cloud-platform"]});
  return resolveExecutionCredential(input,{enabled:true,lookup:credentialLookupFromEnvironment(env,fetcher),
    access:async(reference)=>{
      const pinned=new RegExp(`^projects/${project}/secrets/omniagent-byok-[a-f0-9]{32}/versions/1$`);
      if(!pinned.test(reference))throw Error("byok_reference_binding_invalid");
      const token=await (await auth.getClient()).getAccessToken();
      if(!token.token)throw Error("byok_execution_unavailable");
      const response=await fetcher(`https://secretmanager.googleapis.com/v1/${reference}:access`,{
        redirect:"error",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token.token}`}});
      if(!response.ok)throw Error("byok_execution_unavailable");
      const raw=await response.text();if(Buffer.byteLength(raw)>8192)throw Error("byok_execution_unavailable");
      const value=JSON.parse(raw) as {name?:unknown;payload?:{data?:unknown;dataCrc32c?:unknown}};
      if(value.name!==reference||typeof value.payload?.data!=="string")throw Error("byok_execution_unavailable");
      const bytes=Buffer.from(value.payload.data,"base64");let crc=0xffffffff;
      for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0x82f63b78:0);}
      if(String((crc^0xffffffff)>>>0)!==String(value.payload.dataCrc32c))throw Error("byok_integrity_failure");
      return bytes.toString("utf8");
    }});
}
