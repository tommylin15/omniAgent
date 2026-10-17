/**
 * Read-only, admin-scoped Router Usage report.
 *
 * Chat turns are NOT asserted to be billed provider calls; the Shared Gemini
 * ledger is the only source of verified provider-call attempts here.
 * Missing tokens remain null, never zero or a budget estimate.
 */
export type UsageRow = {
  source: "chat_turns" | "shared_gemini";
  day: string;
  project: string;
  ownerId: string;
  provider: string;
  model: string;
  status: string;
  calls: number;
  tokens: number | null;
};

type Result = { rows: Record<string, unknown>[] };
export type QueryReader = { query(sql: string, params?: unknown[]): Promise<Result> };
export type UsageReport = {
  generatedAt: string;
  days: number;
  timezone: "UTC";
  sources: { chatTurns: "available"; sharedGemini: "available" | "not_configured" | "unavailable" };
  truncated: boolean;
  rows: UsageRow[];
};

const LIMIT = 5001;
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
  return {source,day:String(value.day),project:value.project,ownerId:value.ownerId,
    provider:value.provider,model:value.model,status:value.status,calls,tokens:tokenCount};
}

export class RouterUsageStats {
  constructor(private readonly chat:QueryReader,private readonly gateway?:QueryReader) {}
  async read(days:1|7|30):Promise<UsageReport> {
    const chatRows=(await this.chat.query(CHAT_SQL,[days])).rows;
    let gatewayRows:Record<string,unknown>[]=[];
    let sharedGemini:UsageReport["sources"]["sharedGemini"] =
      this.gateway?"available":"not_configured";
    if(this.gateway) {
      try { gatewayRows=(await this.gateway.query(GATEWAY_SQL,[days])).rows; }
      catch { sharedGemini="unavailable"; }
    }
    const truncated=chatRows.length>=LIMIT || gatewayRows.length>=LIMIT;
    const rows=[
      ...chatRows.slice(0,LIMIT-1).map(x=>asRow(x,"chat_turns")),
      ...gatewayRows.slice(0,LIMIT-1).map(x=>asRow(x,"shared_gemini"))
    ];
    return {generatedAt:new Date().toISOString(),days,timezone:"UTC",
      sources:{chatTurns:"available",sharedGemini},truncated,rows};
  }
}
