/**
 * Minimal, private text-only Gemini vertical slice for omniAgent Chat,
 * market-mart, and life-assistant.
 *
 * Cloud Run IAM must independently restrict invokers. A signed Google service
 * account ID token is checked again here against an exact project->SA map.
 * This does not authorize any end-user action or publish an analysis result:
 * consumer backends MUST authorize their own owner and business request.
 */
import { OAuth2Client } from "google-auth-library";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { GeminiProvider, GeminiProviderError, type GeminiResult } from "./gemini_provider.js";
import { isAllowedGeminiModel } from "./gemini_model_policy.js";
import { parseOwnerAuthorizationKeys, verifyOwnerAuthorization } from "./owner_authorization.js";
import { PgModelQuotaLedger,createQuotaPool,parseQuotaLimits,ModelQuotaDenied,type ModelQuotaLedger } from "./model_quota_ledger.js";
import { PgGatewayUsageRecorder,createUsagePool,type GatewayUsageRecorder } from "./model_usage_telemetry.js";

const PROJECTS = ["omniagent", "market-mart", "life-assistant"] as const;
type Project = typeof PROJECTS[number];
const PROJECT_SET = new Set<string>(PROJECTS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SA = /^[a-z0-9][a-z0-9.-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
// Gateway JSON envelope also covers Python JSON's escaped non-ASCII text.
// Only market-mart has the larger authorized CEO-analysis input budget.
const MAX_BODY = 128 * 1024;
const MAX_PROMPT = 8 * 1024;
const MAX_MARKET_MART_PROMPT = 32 * 1024;
const MAX_OUTPUT = 32_000;
const MAX_RUNNING = 2;
const DEFAULT_OUTPUT_TOKENS = 512;
const MARKET_MART_OUTPUT_TOKENS = 2_048;
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export type SharedGeminiRequest = {
  project: Project; ownerId: string; requestId: string; prompt: string; model: string;
};
type Verify = (token: string, audience: string) => Promise<string>;
type Generate = (prompt: string, model: string, maxOutputTokens: number) => Promise<GeminiResult>;
type Configuration = {
  env?: NodeJS.ProcessEnv;
  verify?: Verify;
  generate?: Generate;
  quota?: ModelQuotaLedger;
  usage?: GatewayUsageRecorder;
};

// Stable, deliberately coarse diagnostic categories; never serialize raw Gemini
// errors, prompts, provider payloads, safety ratings or token credentials.
type ExecutionReason = "output_limit" | "safety_blocked" | "model_stopped" |
  "empty_model_reply" | "response_too_large" | "provider_rejected" |
  "provider_unavailable" | "provider_timeout" | "provider_network_error" |
  "provider_invalid_response" | "unexpected_failure";

class SharedExecutionError extends Error {
  constructor(public readonly reason: ExecutionReason) { super(reason); }
}

type GatewayFailure = {httpStatus:429|502|503|504; reason:ExecutionReason;
  upstreamStatus?:number; transient:boolean};

// A classification is not permission to replay or publish a failed CEO request.
function classifyExecutionFailure(error:unknown):GatewayFailure {
  if (error instanceof GeminiProviderError) {
    const upstreamStatus=error.status;
    if (upstreamStatus===429) return {httpStatus:429,reason:"provider_rejected",
      upstreamStatus,transient:false};
    if (upstreamStatus===503) return {httpStatus:503,reason:"provider_unavailable",
      upstreamStatus,transient:true};
    if (upstreamStatus===408 || upstreamStatus===504)
      return {httpStatus:504,reason:"provider_timeout",upstreamStatus,transient:true};
    if (upstreamStatus===500 || upstreamStatus===502)
      return {httpStatus:502,reason:"provider_unavailable",upstreamStatus,transient:true};
    return {httpStatus:502,reason:"provider_rejected",upstreamStatus,transient:false};
  }
  if (error instanceof SharedExecutionError)
    return {httpStatus:502,reason:error.reason,transient:false};
  if (error instanceof Error && (error.name==="TimeoutError" || error.name==="AbortError"))
    return {httpStatus:504,reason:"provider_timeout",transient:true};
  if (error instanceof TypeError)
    return {httpStatus:502,reason:"provider_network_error",transient:true};
  if (error instanceof SyntaxError)
    return {httpStatus:502,reason:"provider_invalid_response",transient:false};
  return {httpStatus:502,reason:"unexpected_failure",transient:false};
}

function assertSafeGeminiAnswer(answer: GeminiResult, expectedModel: string): void {
  if (answer.model !== expectedModel) throw new SharedExecutionError("unexpected_failure");
  // MAX_TOKENS may include a nonempty but incomplete JSON fragment: never
  // publish it as a completed CEO analysis for downstream persistence.
  if (answer.finishReason === "MAX_TOKENS") throw new SharedExecutionError("output_limit");
  if (answer.blockReason && answer.blockReason !== "BLOCK_REASON_UNSPECIFIED")
    throw new SharedExecutionError("safety_blocked");
  if (answer.finishReason && answer.finishReason !== "STOP") {
    const safety = ["SAFETY","RECITATION","BLOCKLIST","PROHIBITED_CONTENT","SPII","IMAGE_SAFETY"];
    throw new SharedExecutionError(safety.includes(answer.finishReason) ? "safety_blocked" : "model_stopped");
  }
  if (!answer.text.trim()) throw new SharedExecutionError("empty_model_reply");
  if (answer.text.length > MAX_OUTPUT) throw new SharedExecutionError("response_too_large");
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parseGeminiCallers(raw: string): Map<Project, string> {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed) || Object.keys(parsed).length !== PROJECTS.length ||
      Object.keys(parsed).some((project) => !PROJECT_SET.has(project)))
    throw new Error("invalid_gemini_callers");
  const map = new Map<Project, string>();
  for (const project of PROJECTS) {
    const email = parsed[project];
    if (typeof email !== "string" || !SA.test(email))
      throw new Error("invalid_gemini_callers");
    map.set(project, email.toLowerCase());
  }
  if (new Set(map.values()).size !== map.size)
    throw new Error("gemini_callers_must_be_distinct");
  return map;
}

export function parseSharedGeminiRequest(value: unknown, defaultModel: string): SharedGeminiRequest {
  if (!isObject(value) ||
      Object.keys(value).some((key) => !["project","ownerId","requestId","prompt","model"].includes(key)))
    throw new Error("invalid_request");
  const {project,ownerId,requestId,prompt,model} = value;
  const selected = model === undefined ? defaultModel : model;
  if (typeof project !== "string" || !PROJECT_SET.has(project) ||
      typeof ownerId !== "string" || !UUID.test(ownerId) ||
      typeof requestId !== "string" || !UUID.test(requestId) ||
      typeof prompt !== "string" || !prompt.trim() ||
      Buffer.byteLength(prompt,"utf8") > (project === "market-mart" ? MAX_MARKET_MART_PROMPT : MAX_PROMPT) ||
      typeof selected !== "string" || !isAllowedGeminiModel(selected))
    throw new Error("invalid_request");
  return {project: project as Project,ownerId,requestId,prompt,model:selected};
}

export const verifyGeminiCaller: Verify = async (token, audience) => {
  const claim = (await new OAuth2Client().verifyIdToken({idToken:token,audience})).getPayload();
  if (claim?.email_verified !== true || typeof claim.email !== "string" ||
      !SA.test(claim.email.toLowerCase()))
    throw new Error("unverified_caller");
  return claim.email.toLowerCase();
};

async function readJson(request: IncomingMessage): Promise<unknown> {
  let total = 0;
  const parts: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY) throw new Error("body_too_large");
    parts.push(buffer);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}

function send(reply: ServerResponse, status: number, body: unknown): void {
  reply.writeHead(status, {"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
  reply.end(JSON.stringify(body));
}

export function makeSharedGeminiHandler(options: Configuration = {}) {
  const env = options.env ?? process.env;
  const enabled = env.GEMINI_SHARED_EXECUTION_ENABLED === "true";
  // Fail closed on invalid configuration, but do not block existing Gateway
  // routes when the new feature is disabled.
  const audience = enabled ? (env.GEMINI_SHARED_AUDIENCE || "") : "";
  const defaultModel = env.GEMINI_SHARED_MODEL || DEFAULT_MODEL;
  if (enabled && (!/^https:\/\/[^/?#]+\/?$/.test(audience) ||
      !isAllowedGeminiModel(defaultModel) || !env.GEMINI_API_KEY ||
      env.GEMINI_PAID_ENABLED === "true"))
    throw new Error("shared_gemini_configuration_unavailable");
  const callers = enabled ? parseGeminiCallers(env.GEMINI_SHARED_CALLERS_JSON || "") : new Map<Project,string>();
  const ownerAuthorizationRequired = env.GEMINI_SHARED_REQUIRE_OWNER_AUTHORIZATION === "true";
  const quotaEnabled=env.GEMINI_SHARED_QUOTA_ENABLED==="true";
  if(quotaEnabled&&!ownerAuthorizationRequired)throw Error("quota_requires_owner_authorization");
  // Fresh HMAC without a shared replay ledger can be reused on another node.
  if(ownerAuthorizationRequired&&!quotaEnabled)throw Error("owner_authorization_requires_quota");
  const ownerKeys = ownerAuthorizationRequired
    ? parseOwnerAuthorizationKeys(env.GEMINI_SHARED_OWNER_AUTHORIZATION_KEYS_JSON || "",PROJECTS)
    : new Map<string,string>();
  const quota:ModelQuotaLedger|undefined=quotaEnabled
    ? options.quota ?? new PgModelQuotaLedger(createQuotaPool(env),
       parseQuotaLimits(env.GEMINI_SHARED_QUOTA_LIMITS_JSON||"")) : undefined;
  // Passive telemetry is independent of strict quota/Owner-HMAC policy.
  // Disabled by default, so existing Life/Janus calls are unaffected.
  const usage = enabled && env.GEMINI_SHARED_USAGE_ENABLED === "true"
    ? options.usage ?? new PgGatewayUsageRecorder(createUsagePool(env)) : undefined;
  const verify = options.verify ?? verifyGeminiCaller;
  const generate: Generate = options.generate ?? ((prompt,model,maxOutputTokens) =>
    new GeminiProvider(env.GEMINI_API_KEY || "",model).generate(prompt,{
      signal:AbortSignal.timeout(60_000),maxOutputTokens
    }));
  let running = 0;
  return async (request: IncomingMessage, reply: ServerResponse): Promise<void> => {
    if (!enabled) return send(reply,404,{error:"not_found"});
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ") || authorization.length < 10)
      return send(reply,401,{error:"unauthenticated"});
    let caller: string;
    try { caller = await verify(authorization.slice(7),audience); }
    catch { return send(reply,401,{error:"unauthenticated"}); }
    let body: SharedGeminiRequest;
    try { body = parseSharedGeminiRequest(await readJson(request),defaultModel); }
    catch { return send(reply,400,{error:"invalid_request"}); }
    if (caller !== callers.get(body.project)) return send(reply,403,{error:"caller_project_mismatch"});
    if (ownerAuthorizationRequired && !verifyOwnerAuthorization(request.headers,{
      project:body.project,ownerId:body.ownerId,requestId:body.requestId,audience,
      prompt:body.prompt,model:body.model
    },ownerKeys)) return send(reply,403,{error:"owner_authorization_required"});
    if (running >= MAX_RUNNING) return send(reply,429,{error:"gateway_busy",requestId:body.requestId});
    const maxOutputTokens=body.project==="market-mart"
      ? MARKET_MART_OUTPUT_TOKENS:DEFAULT_OUTPUT_TOKENS;
    if(quota){
      try{await quota.reserve({...body,maxOutputTokens});}
      catch(error){
        if(error instanceof ModelQuotaDenied)return send(reply,
          error.code==="duplicate_request"?409:429,{error:error.code,requestId:body.requestId});
        return send(reply,503,{error:"quota_ledger_unavailable",requestId:body.requestId});
      }
    }
    running++;
    const started = Date.now();
    const executionId = usage ? randomUUID() : "";
    const capture = async (status:"completed"|"failed",providerTokens:number|null) => {
      if (!usage) return;
      try {
        await usage.record({executionId,project:body.project,ownerId:body.ownerId,
          requestId:body.requestId,model:body.model,status,providerTokens,
          durationMs:Math.max(0,Date.now()-started)});
      } catch {
        // Never change a Gemini business result or replay it because
        // an independent analytics write failed. Alert on these logs;
        // metrics coverage is then incomplete rather than "zero calls".
        console.warn(JSON.stringify({kind:"gateway_usage_capture",state:"unavailable",
          project:body.project}));
      }
    };
    try {
      const answer = await generate(body.prompt,body.model,maxOutputTokens);
      assertSafeGeminiAnswer(answer,body.model);
      await capture("completed",answer.usage?.totalTokens ?? null);
      if(quota){
        try{await quota.settle(body,"completed",answer.usage);}
        catch{return send(reply,503,{error:"quota_settlement_uncertain",requestId:body.requestId});}
      }
      console.info(JSON.stringify({kind:"shared_gemini_call",project:body.project,requestId:body.requestId,
        status:"completed",model:answer.model,durationMs:Date.now()-started}));
      return send(reply,200,{status:"completed",project:body.project,ownerId:body.ownerId,
        requestId:body.requestId,model:answer.model,result:{text:answer.text},
        ...(answer.usage?{usage:answer.usage}:{})});
    } catch (error) {
      const failure=classifyExecutionFailure(error);
      await capture("failed",null);
      if(quota){
        try{await quota.settle(body,"failed");}
        catch{return send(reply,503,{error:"quota_settlement_uncertain",requestId:body.requestId});}
      }
      const code=failure.httpStatus===429 ? "gemini_quota" : "gemini_execution_failed";
      console.info(JSON.stringify({kind:"shared_gemini_call",project:body.project,requestId:body.requestId,
        status:"failed",failureCode:code,reason:failure.reason,
        ...(failure.upstreamStatus ? {upstreamStatus:failure.upstreamStatus}:{}),
        transient:failure.transient,retriesPerformed:0,
        promptBytes:Buffer.byteLength(body.prompt,"utf8"),durationMs:Date.now()-started}));
      return send(reply,failure.httpStatus,{status:"failed",requestId:body.requestId,error:code,
        ...(failure.httpStatus!==429 ? {reason:failure.reason}:{}),
        ...(failure.upstreamStatus ? {upstreamStatus:failure.upstreamStatus}:{}),
        ...(failure.transient ? {transient:true}:{})});
    } finally { running--; }
  };
}
