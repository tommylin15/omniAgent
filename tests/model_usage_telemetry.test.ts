import { describe,expect,it,vi } from "vitest";
import { createUsagePool,PgGatewayUsageRecorder } from "../services/agent-gateway/model_usage_telemetry.js";

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
