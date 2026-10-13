/**
 * Minimal, private text-only Gemini vertical slice for omniAgent Chat,
 * market-mart (Janus), and life-assistant.
 *
 * Cloud Run IAM must independently restrict invokers. A signed Google service
 * account ID token is checked again here against an exact project->SA map.
 * This does not authorize any end-user action or publish an analysis result:
 * consumer backends MUST authorize their own owner and business request.
 */
import { OAuth2Client } from "google-auth-library";
import type { IncomingMessage, ServerResponse } from "node:http";
import { GeminiProvider, GeminiProviderError, type GeminiResult } from "./gemini_provider.js";
import { isAllowedGeminiModel } from "./gemini_model_policy.js";

const PROJECTS = ["omniagent", "market-mart", "life-assistant"] as const;
type Project = typeof PROJECTS[number];
const PROJECT_SET = new Set<string>(PROJECTS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SA = /^[a-z0-9][a-z0-9.-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
const MAX_BODY = 12_000;
const MAX_PROMPT = 8_192;
const MAX_OUTPUT = 32_000;
const MAX_RUNNING = 2;
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export type SharedGeminiRequest = {
  project: Project; ownerId: string; requestId: string; prompt: string; model: string;
};
type Verify = (token: string, audience: string) => Promise<string>;
type Generate = (prompt: string, model: string) => Promise<GeminiResult>;
type Configuration = {
  env?: NodeJS.ProcessEnv;
  verify?: Verify;
  generate?: Generate;
};

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
      typeof prompt !== "string" || !prompt.trim() || Buffer.byteLength(prompt,"utf8") > MAX_PROMPT ||
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
  const verify = options.verify ?? verifyGeminiCaller;
  const generate: Generate = options.generate ?? ((prompt,model) =>
    new GeminiProvider(env.GEMINI_API_KEY || "",model).generate(prompt,{
      signal:AbortSignal.timeout(60_000)
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
    if (running >= MAX_RUNNING) return send(reply,429,{error:"gateway_busy",requestId:body.requestId});
    running++;
    const started = Date.now();
    try {
      const answer = await generate(body.prompt,body.model);
      if (!answer.text.trim() || answer.text.length > MAX_OUTPUT ||
          answer.model !== body.model) throw new Error("invalid_provider_reply");
      console.info(JSON.stringify({kind:"shared_gemini_call",project:body.project,requestId:body.requestId,
        status:"completed",model:answer.model,durationMs:Date.now()-started}));
      return send(reply,200,{status:"completed",project:body.project,ownerId:body.ownerId,
        requestId:body.requestId,model:answer.model,result:{text:answer.text},
        ...(answer.usage?{usage:answer.usage}:{})});
    } catch (error) {
      const status = error instanceof GeminiProviderError && error.kind === "quota" ? 429 : 502;
      const code = status === 429 ? "gemini_quota" : "gemini_execution_failed";
      console.info(JSON.stringify({kind:"shared_gemini_call",project:body.project,requestId:body.requestId,
        status:"failed",failureCode:code,durationMs:Date.now()-started}));
      return send(reply,status,{status:"failed",requestId:body.requestId,error:code});
    } finally { running--; }
  };
}
