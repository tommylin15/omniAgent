/**
 * Opt-in passive per-invocation Gemini execution receipts.
 * Does not grant model access, enforce quota, or alter consumer responses.
 * A failed INSERT is logged by the caller and never replays provider work.
 * Record only bounded metadata; NEVER serialize a prompt or OAuth credential.
 */
import { isIP } from "node:net";
import { Pool, type PoolConfig } from "pg";
import { routerUsageBundleConnection } from "./router_usage_bundle.js";

export type GatewayUsageReceipt = Readonly<{
  executionId:string; project:string; ownerId:string; requestId:string;
  model:string; status:"completed"|"failed"; providerTokens:number|null;
  durationMs:number;
}>;
export interface GatewayUsageRecorder {
  record(row:GatewayUsageReceipt):Promise<void>;
}

export function createUsagePool(env:NodeJS.ProcessEnv):Pool {
  const bundle=routerUsageBundleConnection(env.OMNIAGENT_PROVIDER_BUNDLE,"writer");
  if(bundle && (env.GEMINI_SHARED_USAGE_DATABASE_URL ||
       env.GEMINI_SHARED_USAGE_CA_PEM || env.GEMINI_SHARED_USAGE_TLS_SERVERNAME))
    throw Error("gateway_usage_conflicting_configuration");
  const dsn=bundle?.databaseUrl ?? env.GEMINI_SHARED_USAGE_DATABASE_URL;
  const ca=bundle?.caPem ?? env.GEMINI_SHARED_USAGE_CA_PEM;
  const tlsServername=bundle?.tlsServername ?? env.GEMINI_SHARED_USAGE_TLS_SERVERNAME;
  let url:URL;
  try { url=new URL(dsn||""); }
  catch {throw Error("gateway_usage_verified_tls_required");}
  if(!["postgres:","postgresql:"].includes(url.protocol) ||
     !url.username || !url.hostname || url.pathname==="/" ||
     !url.pathname.startsWith("/omniagent_") ||
     url.searchParams.get("sslmode")!=="require" ||
     !ca?.includes("-----BEGIN CERTIFICATE-----") ||
     !ca.includes("-----END CERTIFICATE-----") ||
     (isIP(url.hostname)!==0 && !tlsServername)) {
    throw Error("gateway_usage_verified_tls_required");
  }
  const name=tlsServername || url.hostname;
  if(!/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(name))
    throw Error("gateway_usage_verified_tls_required");
  url.searchParams.delete("sslmode");
  const config:PoolConfig={connectionString:url.toString(),
    max:2,connectionTimeoutMillis:1500,statement_timeout:1500,
    ssl:{rejectUnauthorized:true,ca,servername:name}};
  return new Pool(config);
}

export class PgGatewayUsageRecorder implements GatewayUsageRecorder {
  constructor(private readonly pool:Pick<Pool,"query">){}
  async record(row:GatewayUsageReceipt):Promise<void> {
    if(!Number.isSafeInteger(row.durationMs) || row.durationMs<0 ||
       row.durationMs>3_600_000 ||
       (row.providerTokens!==null &&
        (!Number.isSafeInteger(row.providerTokens)||row.providerTokens<0)))
      throw Error("gateway_usage_receipt_invalid");
    await this.pool.query(`
      INSERT INTO omni_gateway.router_usage_events
        (execution_id,project,owner_id,request_id,model,status,provider_tokens,duration_ms)
      VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8)
      ON CONFLICT DO NOTHING
    `,[row.executionId,row.project,row.ownerId,row.requestId,
       row.model,row.status,row.providerTokens,row.durationMs]);
  }
}
