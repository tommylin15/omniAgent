/**
 * Read-only, admin-scoped Router Usage report.
 *
 * Chat turns are NOT asserted to be billed provider calls; the Shared Gemini
 * ledger is the only source of verified provider-call attempts here.
 * Missing tokens remain null, never zero or a budget estimate.
 */
export type UsageRow = {
  source: "chat_turns" | "shared_gemini" | "provider_executions";
  day: string;
  project: string;
  ownerId: string;
  provider: string;
  model: string;
  status: string;
  calls: number;
  tokens: number | null;
  costMicros?:number|null;
};

type Result = { rows: Record<string, unknown>[] };
export type QueryReader = { query(sql: string, params?: unknown[]): Promise<Result> };
export type UsageReport = {
  generatedAt: string;
  days: number;
  timezone: "UTC";
  gatewayMode: "quota" | "passive" | "unified";
  sources: { chatTurns: "available"; sharedGemini: "available" | "not_configured" | "unavailable" };
  truncated: boolean;
  rows: UsageRow[];
};

const LIMIT = 5001;
const UNIFIED_SQL=`SELECT to_char((created_at AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day,
  project,owner_id::text AS "ownerId",provider,model,
  CASE WHEN source='legacy-shared-gemini' THEN 'legacy_'||state
    WHEN provider_responded_at IS NOT NULL AND upstream_status BETWEEN 200 AND 299
      THEN CASE WHEN state='completed' THEN 'completed' ELSE 'response_unreconciled' END
    WHEN provider_responded_at IS NOT NULL THEN 'provider_error'
    WHEN dispatch_started_at IS NOT NULL THEN 'outcome_unknown' ELSE state END AS status,
  count(*)::integer AS calls,
  CASE WHEN count(total_tokens)=count(*) THEN sum(total_tokens)::bigint ELSE NULL::bigint END AS tokens,
  CASE WHEN count(cost_microusd)=count(*) THEN sum(cost_microusd)::bigint ELSE NULL::bigint END AS "costMicros"
  FROM omni_gateway.unified_provider_execution_usage
  WHERE owner_id<>'00000000-0000-4000-8000-000000000001'::uuid
    AND created_at>=(((now() AT TIME ZONE 'UTC')::date-($1::integer-1))::timestamp AT TIME ZONE 'UTC')
  GROUP BY 1,2,3,4,5,6 ORDER BY 1 DESC,2,3,4,5,6 LIMIT 5001`;
// No prompts, contents, credentials, raw provider messages or OAuth subjects.
const CHAT_SQL = `
  SELECT to_char((t.created_at AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day,
         'omniagent'::text AS project,
         t.owner_id::text AS "ownerId",
         th.runtime::text AS provider, th.model::text AS model,
         lower(t.status)::text AS status, count(*)::integer AS calls,
         NULL::bigint AS tokens
  FROM omni_chat.turns t
  JOIN omni_chat.threads th ON th.owner_id=t.owner_id AND th.thread_id=t.thread_id
  WHERE t.created_at >= (((now() AT TIME ZONE 'UTC')::date - ($1::integer - 1))::timestamp AT TIME ZONE 'UTC')
  GROUP BY 1,2,3,4,5,6
  ORDER BY 1 DESC, 2, 3, 4, 5, 6 LIMIT 5001`;
const GATEWAY_SQL = `
  SELECT to_char((created_at AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day,
         project::text AS project, owner_id::text AS "ownerId",
         'gemini'::text AS provider, model::text AS model,
         CASE WHEN status='reserved' AND lease_until < now()
              THEN 'unreconciled' ELSE status END::text AS status,
         count(*)::integer AS calls,
         CASE WHEN count(provider_tokens)=count(*) THEN sum(provider_tokens)::bigint
              ELSE NULL::bigint END AS tokens
  FROM omni_gateway.model_execution_ledger
  WHERE created_at >= (((now() AT TIME ZONE 'UTC')::date - ($1::integer - 1))::timestamp AT TIME ZONE 'UTC')
  GROUP BY 1,2,3,4,5,6
  ORDER BY 1 DESC, 2, 3, 4, 5, 6 LIMIT 5001`;

// RUA-02B passive telemetry counts each actual Gateway execution_id once.
// The owner_id is asserted by an IAM-authenticated consumer, not a verified
// Google human principal. Capture failures are flagged in Gateway logs.
const PASSIVE_SQL = `
  SELECT to_char((created_at AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day,
         project::text AS project, owner_id::text AS "ownerId",
         'gemini'::text AS provider, model::text AS model,
         status::text AS status, count(*)::integer AS calls,
         CASE WHEN count(provider_tokens)=count(*) THEN sum(provider_tokens)::bigint
              ELSE NULL::bigint END AS tokens
  FROM omni_gateway.router_usage_events
  -- Reserved historical P0-V/RUA integration-probe Owner UUID. These are
  -- legitimate *technical* model calls, not authenticated human usage.
  -- Leave audit rows in DB but exclude from human-facing war-room totals.
  WHERE owner_id <> '00000000-0000-4000-8000-000000000001'::uuid
    AND created_at >= (((now() AT TIME ZONE 'UTC')::date - ($1::integer - 1))::timestamp AT TIME ZONE 'UTC')
  GROUP BY 1,2,3,4,5,6
  ORDER BY 1 DESC,2,3,4,5,6 LIMIT 5001`;

export function parseUsageDays(raw: string | null): 1 | 7 | 30 {
  if (raw === null || raw === "7") return 7;
  if (raw === "1" || raw === "30") return Number(raw) as 1 | 30;
  throw new Error("invalid_usage_range");
}

const ownerPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function parseUsageAdmins(raw: string): Set<string> {
  const ids = raw.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!ids.length || ids.some(x=>!ownerPattern.test(x)) || new Set(ids).size!==ids.length)
    throw new Error("router_usage_admin_configuration_invalid");
  return new Set(ids);
}

function asRow(value:Record<string,unknown>,source:UsageRow["source"]):UsageRow {
  const tokens=value.tokens;
  const calls=Number(value.calls);
  const tokenCount=tokens==null?null:Number(tokens);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.day)) ||
      typeof value.project!=="string" || !value.project ||
      typeof value.ownerId!=="string" || !ownerPattern.test(value.ownerId) ||
      typeof value.provider!=="string" || !value.provider ||
      typeof value.model!=="string" || !value.model ||
      typeof value.status!=="string" || !value.status ||
      !Number.isSafeInteger(calls) || calls<1 ||
      (tokenCount!==null && (!Number.isSafeInteger(tokenCount)||tokenCount<0)))
    throw new Error("router_usage_result_invalid");
  const cost=value.costMicros==null?null:Number(value.costMicros);
  if(cost!==null&&(!Number.isSafeInteger(cost)||cost<0))throw Error("router_usage_cost_invalid");
  return {source,day:String(value.day),project:value.project,ownerId:value.ownerId,
    provider:value.provider,model:value.model,status:value.status,calls,tokens:tokenCount,
    ...(source==="provider_executions"?{costMicros:cost}:{})};
}

export class RouterUsageStats {
  constructor(private readonly chat:QueryReader,private readonly gateway?:QueryReader,
    private readonly gatewayMode:"quota"|"passive"|"unified"="quota") {}
  async read(days:1|7|30):Promise<UsageReport> {
    const chatRows=(await this.chat.query(CHAT_SQL,[days])).rows;
    let gatewayRows:Record<string,unknown>[]=[];
    let sharedGemini:UsageReport["sources"]["sharedGemini"] =
      this.gateway?"available":"not_configured";
    if(this.gateway) {
      try { gatewayRows=(await this.gateway.query(this.gatewayMode==="unified"?UNIFIED_SQL:this.gatewayMode==="passive"?PASSIVE_SQL:GATEWAY_SQL,[days])).rows; }
      catch { sharedGemini="unavailable"; }
    }
    const truncated=chatRows.length>=LIMIT || gatewayRows.length>=LIMIT;
    const rows=[
      ...chatRows.slice(0,LIMIT-1).map(x=>asRow(x,"chat_turns")),
      ...gatewayRows.slice(0,LIMIT-1).map(x=>asRow(x,this.gatewayMode==="unified"?"provider_executions":"shared_gemini"))
    ];
    return {generatedAt:new Date().toISOString(),days,timezone:"UTC",gatewayMode:this.gatewayMode,
      sources:{chatTurns:"available",sharedGemini},truncated,rows};
  }
}
