import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OAuth2Client } from "google-auth-library";
import { AppServerClient, ManagedAuthStore } from "../agent-gateway/server.js";
import { CodexBridge } from "../agent-gateway/codex_bridge.js";
import { McpHost } from "../agent-gateway/mcp_host.js";

export type CallerIdentity = { project: string; serviceAccount: string };
export type RequestBody = { project: string; ownerId: string; requestId: string; prompt: string; model?: string };
type Execution = { text: string; threadId: string; turnId: string };
type Execute = (request: RequestBody) => Promise<Execution>;
type Verify = (token: string, audience: string) => Promise<string>;

// Stable, non-secret failure stages. This is safe to expose only after signed
// identity and project authorization; never return native exception messages.
export type CodexFailureStage =
  | "auth_load" | "app_server_spawn" | "app_server_initialize"
  | "account_read" | "account_refresh" | "thread_start" | "turn_start" | "turn_events"
  | "auth_persist";

export type CodexRefreshFailureReason =
  | "reauth_required" | "refresh_rejected" | "refresh_timeout"
  | "refresh_network" | "account_unavailable" | "unknown";

// Never emit native RPC messages: they may contain authentication material.
// Only a fixed vocabulary reaches an already authorized caller or Cloud Logging.
export function classifyCodexRefreshFailure(failure: unknown): CodexRefreshFailureReason {
  const message = failure instanceof Error ? failure.message.toLowerCase() : "";
  if (/refresh_token_invalidated|invalid_grant|since logged out|signed in to another account|please sign in again/.test(message)) {
    return "reauth_required";
  }
  if (/\b401\b|\b403\b|unauthorized|forbidden|token refresh rejected/.test(message)) return "refresh_rejected";
  if (/timeout|timed out|deadline exceeded/.test(message)) return "refresh_timeout";
  if (/econn|enotfound|dns|network|socket|tls|certificate/.test(message)) return "refresh_network";
  if (/managed auth is unavailable|account unavailable/.test(message)) return "account_unavailable";
  return "unknown";
}

export class CodexExecutionStageError extends Error {
  constructor(readonly stage: CodexFailureStage, readonly reason?: CodexRefreshFailureReason) {
    super("codex_execution_failed");
    this.name = "CodexExecutionStageError";
  }
}

const PROJECT = /^[a-z][a-z0-9-]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const MAX_BODY_BYTES = 20_000;
const MAX_PROMPT_BYTES = 16_384;
const MAX_OUTPUT_CHARS = 32_000;
const TURN_TIMEOUT_MS = 120_000;

function json(reply: ServerResponse, status: number, body: unknown): void {
  reply.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  reply.end(JSON.stringify(body));
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_body");
  return value as Record<string, unknown>;
}

export function parseCallers(raw: string): Map<string, string> {
  const data = record(JSON.parse(raw));
  const callers = new Map<string, string>();
  for (const [project, serviceAccount] of Object.entries(data)) {
    if (!PROJECT.test(project) || typeof serviceAccount !== "string" ||
        !/^[a-z0-9][a-z0-9.-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
      throw new Error("invalid_callers");
    }
    callers.set(project, serviceAccount.toLowerCase());
  }
  if (!callers.size) throw new Error("missing_callers");
  return callers;
}

export function parseRequest(body: unknown): RequestBody {
  const data = record(body);
  const fields = Object.keys(data).sort();
  if (fields.some((key) => !["project", "ownerId", "requestId", "prompt", "model"].includes(key))) throw new Error("unexpected_field");
  const { project, ownerId, requestId, prompt, model } = data;
  if (typeof project !== "string" || !PROJECT.test(project) ||
      typeof ownerId !== "string" || !UUID.test(ownerId) ||
      typeof requestId !== "string" || !UUID.test(requestId) ||
      typeof prompt !== "string" || !prompt.trim() ||
      Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_BYTES ||
      (model !== undefined && (typeof model !== "string" || !MODEL.test(model)))) {
    throw new Error("invalid_request");
  }
  return { project, ownerId, requestId, prompt, ...(model ? { model: model as string } : {}) };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const parts: Buffer[] = [];
  let total = 0;
  for await (const part of request) {
    total += Buffer.byteLength(part);
    if (total > MAX_BODY_BYTES) throw new Error("request_too_large");
    parts.push(Buffer.from(part));
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}

export const verifyGoogleIdentity: Verify = async (token, audience) => {
  const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
  const claim = ticket.getPayload();
  if (claim?.email_verified !== true || typeof claim.email !== "string") throw new Error("unverified_identity");
  return claim.email.toLowerCase();
};

/**
 * Fresh home, workspace, App Server and native thread per request.
 * The model receives only caller-supplied text, not credentials or other projects' data.
 */
export async function executeCodex(body: RequestBody): Promise<Execution> {
  const resource = process.env.SHARED_CODEX_AUTH_RESOURCE || "";
  if (!/^projects\/[^/]+\/secrets\/[^/]+$/.test(resource)) throw new Error("auth_not_configured");
  if (process.env.CODEX_SANDBOX_MODE !== "read-only") throw new Error("sandbox_not_readonly");
  const root = await mkdtemp(join(process.env.SANDBOX_ROOT || tmpdir(), "shared-codex-"));
  const home = join(root, "codex-home");
  const workspace = join(root, "workspace");
  const auth = new ManagedAuthStore(resource);
  const client = new AppServerClient(process.env.CODEX_BIN || "codex", [], home);
  const mcp = new McpHost();
  let started = false;
  let error: unknown;
  let stage: CodexFailureStage = "auth_load";
  try {
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    await mkdir(home, { recursive: true, mode: 0o700 });
    await writeFile(join(home, "config.toml"),
      'approval_policy = "never"\nsandbox_mode = "read-only"\nweb_search = "disabled"\n' +
      'check_for_update_on_startup = false\ncli_auth_credentials_store = "file"\n' +
      '[features]\nshell_tool = false\nunified_exec = false\napps = false\n' +
      'multi_agent = false\nplugins = false\nhooks = false\nbrowser_use = false\ncomputer_use = false\n',
      { mode: 0o600 });
    await auth.load(home);
    stage = "app_server_spawn";
    client.start();
    started = true;
    const bridge = new CodexBridge(body.ownerId, workspace, client, mcp);
    client.onFailure(() => bridge.processError());
    stage = "app_server_initialize";
    await bridge.initialize((step) => {
      stage = step === "account" ? "account_read"
        : step === "refresh" ? "account_refresh" : "app_server_initialize";
    }, { refreshToken: false });
    stage = "auth_persist";
    await auth.persistIfChanged(home);
    stage = "thread_start";
    const created = record(await bridge.startThread(body.model));
    const threadId = record(created.thread).id;
    if (typeof threadId !== "string") throw new Error("missing_thread");
    stage = "turn_start";
    const start = record(await bridge.startTurn(threadId, body.prompt));
    const turnId = record(start.turn).id;
    if (typeof turnId !== "string") throw new Error("missing_turn");
    let cursor = -1;
    let text = "";
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    stage = "turn_events";
    while (Date.now() < deadline) {
      const events = bridge.eventsAfter(cursor);
      cursor = events.cursor;
      for (const event of events.events) {
        if (event.turnId !== turnId) continue;
        if (event.type === "approval_request") {
          bridge.resolveApproval(String(event.payload.requestId), threadId, turnId,
            String(event.payload.paramsDigest), "decline");
        }
        if (event.type === "text_delta" && typeof event.payload.delta === "string") {
          text += event.payload.delta;
          if (text.length > MAX_OUTPUT_CHARS) throw new Error("output_too_large");
        }
        if (event.type === "turn_cancelled" || event.type === "turn_error") throw new Error("codex_turn_failed");
        if (event.type === "turn_completed") {
          if (!text.trim()) throw new Error("empty_output");
          stage = "auth_persist";
          await auth.persist(home);
          return { text, threadId, turnId };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await bridge.interrupt(threadId, turnId).catch(() => undefined);
    throw new Error("codex_timeout");
  } catch (failure) {
    error = failure;
    // Never leak a provider exception, auth payload or native RPC message.
    throw new CodexExecutionStageError(stage,
      (stage as CodexFailureStage) === "account_refresh" ? classifyCodexRefreshFailure(failure) : undefined);
  } finally {
    const outcomes = await Promise.allSettled([started ? client.stop() : Promise.resolve(), mcp.closeAll()]);
    await rm(root, { recursive: true, force: true });
    if (!error && outcomes.some((outcome) => outcome.status === "rejected")) {
      // Cleanup failures are not allowed to conceal a completed response.
      process.stderr.write("shared_codex_cleanup_error\n");
    }
  }
}

/**
 * Cloud Run IAM is the first gate. The signed Google identity is an independent
 * project-to-service-account binding: a claimed project name cannot switch tenants.
 */
export function makeSharedCodexServer(options: {
  callers: Map<string, string>;
  audience: string;
  execute?: Execute;
  verify?: Verify;
}) {
  const execute = options.execute || executeCodex;
  const verify = options.verify || verifyGoogleIdentity;
  let busy = false;
  return createServer(async (request, reply) => {
    const path = new URL(request.url || "/", "http://localhost").pathname;
    if (request.method === "GET" && path === "/health") {
      return json(reply, 200, { status: "ok", service: "omniagent-shared-codex" });
    }
    if (request.method === "GET" && path === "/ready") {
      return json(reply, options.callers.size && options.audience &&
        /^projects\/[^/]+\/secrets\/[^/]+$/.test(process.env.SHARED_CODEX_AUTH_RESOURCE || "") ? 200 : 503,
        { status: options.callers.size && options.audience &&
          /^projects\/[^/]+\/secrets\/[^/]+$/.test(process.env.SHARED_CODEX_AUTH_RESOURCE || "") ? "configured" : "blocked" });
    }
    if (request.method !== "POST" || path !== "/v1/codex/execute") return json(reply, 404, { error: "not_found" });
    if (busy) return json(reply, 429, { error: "busy" });
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return json(reply, 401, { error: "unauthenticated" });
    let identity: string;
    try {
      identity = await verify(authorization.slice(7), options.audience);
    } catch {
      return json(reply, 401, { error: "unauthenticated" });
    }
    let body: RequestBody;
    try {
      body = parseRequest(await readBody(request));
    } catch {
      return json(reply, 400, { error: "invalid_request" });
    }
    if (options.callers.get(body.project) !== identity) return json(reply, 403, { error: "caller_project_mismatch" });
    busy = true;
    const start = Date.now();
    try {
      const result = await execute(body);
      console.log(JSON.stringify({ kind: "shared_codex_request", project: body.project, requestId: body.requestId,
        status: "completed", durationMs: Date.now() - start }));
      return json(reply, 200, { status: "completed", project: body.project, ownerId: body.ownerId,
        requestId: body.requestId, result: { text: result.text }, providerIds: { threadId: result.threadId, turnId: result.turnId } });
    } catch (failure) {
      const failureStage = failure instanceof CodexExecutionStageError ? failure.stage : "unknown";
      const failureReason = failure instanceof CodexExecutionStageError && failureStage === "account_refresh"
        ? failure.reason : undefined;
      console.log(JSON.stringify({ kind: "shared_codex_request", project: body.project, requestId: body.requestId,
        status: "failed", failureStage, ...(failureReason ? { failureReason } : {}),
        durationMs: Date.now() - start }));
      return json(reply, 502, { status: "failed", requestId: body.requestId,
        error: "codex_execution_failed", failureStage,
        ...(failureReason ? { failureReason } : {}) });
    } finally {
      busy = false;
    }
  });
}

if (process.env.NODE_ENV !== "test") {
  const callers = parseCallers(process.env.SHARED_CODEX_CALLERS_JSON || "{}");
  const audience = process.env.SHARED_CODEX_AUDIENCE || "";
  if (!audience.startsWith("https://") || audience.includes("?")) throw new Error("invalid_audience");
  const port = Number(process.env.PORT || "8080");
  const server = makeSharedCodexServer({ callers, audience }).listen(port, "0.0.0.0",
    () => console.log("shared_codex_listening"));
  process.once("SIGTERM", () => server.close());
}
