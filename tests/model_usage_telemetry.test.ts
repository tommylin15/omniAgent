import { describe,expect,it,vi } from "vitest";
import { createUsagePool,PgGatewayUsageRecorder } from "../services/agent-gateway/model_usage_telemetry.js";
import { routerUsageBundleConnection } from "../services/agent-gateway/router_usage_bundle.js";

const row={
  executionId:"00000000-0000-4000-8000-000000000003",
  project:"life-assistant",
  ownerId:"00000000-0000-4000-8000-000000000001",
  requestId:"00000000-0000-4000-8000-000000000002",
  model:"gemini-3.5-flash-lite",
  status:"completed" as const,
  providerTokens:18,durationMs:123
};
describe("passive Gateway analytics",()=>{
  it("fails closed when the optional writer has no verified TLS and DB identity",()=>{
    expect(()=>createUsagePool({})).toThrow("gateway_usage_verified_tls_required");
    expect(()=>createUsagePool({GEMINI_SHARED_USAGE_DATABASE_URL:
      "postgres://some:secret@127.0.0.1:5432/omniagent_gateway?sslmode=require"}))
      .toThrow("gateway_usage_verified_tls_required");
  });
  it("persists only narrow metadata per actual execution ID without prompt or response",async()=>{
    const query=vi.fn(async(_sql:string,_args?:unknown[])=>({rows:[]}));
    await new PgGatewayUsageRecorder({query} as never).record(row);
    expect(query).toHaveBeenCalledOnce();
    const sql=query.mock.calls[0][0] as string;
    expect(sql).toContain("omni_gateway.router_usage_events");
    expect(sql).toContain("ON CONFLICT (execution_id) DO NOTHING");
    expect(sql).not.toContain("prompt");
    expect(sql).not.toContain("response");
    expect(query.mock.calls[0][1]).toEqual([
      row.executionId,row.project,row.ownerId,row.requestId,row.model,
      row.status,row.providerTokens,row.durationMs
    ]);
  });
  it("rejects malformed durations/token values without touching DB",async()=>{
    const query=vi.fn(async(_sql:string,_args?:unknown[])=>({rows:[]}));
    const writer=new PgGatewayUsageRecorder({query} as never);
    await expect(writer.record({...row,durationMs:-1})).rejects.toThrow();
    await expect(writer.record({...row,providerTokens:-1})).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe("existing shared omniagent-bundle RUA-02B selection",()=>{
  const writer="postgresql://omniagent_usage_writer:fake@10.1.2.3:5432/omniagent_gateway?sslmode=require";
  const reader="postgresql://omniagent_usage_reader:fake@10.1.2.3:5432/omniagent_gateway?sslmode=require";
  const ca="-----BEGIN CERTIFICATE-----\\nZHVtbXk=\\n-----END CERTIFICATE-----";
  const raw=JSON.stringify({gemini_api_key:"existing",
    router_usage:{writer_database_url:writer,reader_database_url:reader,ca_pem:ca,tls_servername:"janus-postgres-dev"}});
  it("reads only role-specific DSN and no secret values in errors",()=>{
    expect(routerUsageBundleConnection(raw,"reader")?.databaseUrl).toBe(reader);
    expect(routerUsageBundleConnection(raw,"writer")?.databaseUrl).toBe(writer);
    expect(routerUsageBundleConnection("{}","reader")).toBeUndefined();
    expect(()=>routerUsageBundleConnection("{bad","writer")).toThrow("router_usage_bundle_invalid");
    expect(()=>routerUsageBundleConnection(JSON.stringify({router_usage:{writer_database_url:reader}}),"writer"))
      .toThrow("router_usage_bundle_invalid");
  });
  it("uses Writer identity for Gateway and rejects mixed env override",()=>{
    const pool=createUsagePool({OMNIAGENT_PROVIDER_BUNDLE:raw});
    expect(pool.options.ssl).toMatchObject({rejectUnauthorized:true,servername:"janus-postgres-dev"});
    expect(pool.options.connectionString).toContain("omniagent_usage_writer");
    expect(pool.options.connectionString).not.toContain("sslmode");
    void pool.end();
    expect(()=>createUsagePool({OMNIAGENT_PROVIDER_BUNDLE:raw,
      GEMINI_SHARED_USAGE_DATABASE_URL:writer}))
      .toThrow("gateway_usage_conflicting_configuration");
  });
});
