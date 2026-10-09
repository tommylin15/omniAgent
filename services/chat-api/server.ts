import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { ChatConflict, ChatNotFound, type ChatStore, type ThreadInput } from "./storage.js";
import type { ChatDispatcher } from "./gateway_dispatch.js";

export type Principal = { issuer: string; subject: string };
export type VerifyUser = (token: string) => Promise<Principal>;
export type VerifyService = (token: string) => Promise<void>;
class InvalidRequest extends Error {}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const TYPES = new Set(["text_delta","item_upsert","tool_request","tool_result","approval_request",
  "approval_resolved","citation","usage","turn_completed","turn_cancelled","turn_error"]);
const MIME: Record<string, string> = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json", ".wasm":"application/wasm",
  ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp",
  ".ico":"image/x-icon", ".ttf":"font/ttf", ".otf":"font/otf" };

async function serveWeb(pathname: string, response: ServerResponse): Promise<boolean> {
  const root = process.env.OMNIAGENT_WEB_ROOT;
  if (!root || pathname === "/v1" || pathname.startsWith("/v1/") ||
      pathname === "/internal" || pathname.startsWith("/internal/") ||
      pathname === "/health" || pathname === "/ready") return false;
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  const name = decoded === "/" ? "index.html" : decoded.slice(1);
  let file = resolve(root,name);
  const within = relative(resolve(root),file);
  if (within === ".." || within.startsWith("../") || within.startsWith("..\\") || isAbsolute(within)) return false;
  try {
    if (!(await stat(file)).isFile()) return false;
  } catch {
    if (extname(name)) return false;
    file = resolve(root,"index.html");
    try { if (!(await stat(file)).isFile()) return false; } catch { return false; }
  }
  response.writeHead(200,{ "Content-Type":MIME[extname(file)] ?? "application/octet-stream",
    "Cache-Control":file.endsWith("index.html") ? "no-cache" : "public, max-age=3600" });
  createReadStream(file).pipe(response);
  return true;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function bearer(request: IncomingMessage): string {
  const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "");
  if (!match) throw new Error("authentication required");
  return match[1];
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > 65_536) throw new InvalidRequest("request exceeds byte limit");
    chunks.push(value);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new InvalidRequest("JSON object required");
  return parsed as Record<string, unknown>;
}

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value)) throw new InvalidRequest(name + " is invalid");
  return value;
}

function key(request: IncomingMessage): string {
  return id(request.headers["idempotency-key"], "Idempotency-Key");
}

function threadInput(value: Record<string, unknown>): ThreadInput {
  if (!["openrouter","gemini","codex"].includes(String(value.runtime))) throw new InvalidRequest("runtime is invalid");
  const model = value.runtime === "openrouter" && typeof value.model === "string"
    && value.model.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*(?:\/[A-Za-z0-9][A-Za-z0-9._:-]*)?$/.test(value.model)
    ? value.model : id(value.model,"model");
  return { runtime: value.runtime as ThreadInput["runtime"], model,
    assistantProfile: id(value.assistantProfile,"assistant profile"),
    ...(value.threadId === undefined ? {} : { threadId: id(value.threadId,"thread id") }),
    ...(value.skillProfile === undefined ? {} : { skillProfile: id(value.skillProfile,"skill profile") }),
    ...(value.parentThreadId === undefined ? {} : { parentThreadId: id(value.parentThreadId,"parent thread id") }) };
}

export function makeChatServer(store: ChatStore, verifyUser: VerifyUser, verifyService: VerifyService,
                               dispatcher?: Pick<ChatDispatcher,"runOnce">) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/health") return send(response,200,{ status: "ok" });
    if (request.method === "GET" && url.pathname === "/ready") {
      try {
        await store.ready();
        return send(response,200,{ status: "ready" });
      } catch {
        return send(response,503,{ status: "unavailable" });
      }
    }
    if (request.method === "GET" && await serveWeb(url.pathname,response)) return;
    try {
      const token = bearer(request);
      if (url.pathname.startsWith("/internal/v1/")) {
        await verifyService(token);
        // A caller cannot select an owner: the dispatcher claims its own
        // owner-bound work from PostgreSQL. This endpoint is disabled by default.
        if (request.method === "POST" && url.pathname === "/internal/v1/chat/dispatch:once") {
          if (!dispatcher) return send(response,404,{ error:"not_found" });
          return send(response,200,await dispatcher.runOnce());
        }
        const value = await body(request);
        const ownerId = id(value.ownerId,"owner id");
        const threadId = id(value.threadId,"thread id");
        const turnId = id(value.turnId,"turn id");
        if (request.method === "POST" && url.pathname === "/internal/v1/chat/events") {
          const type = String(value.type);
          if (!TYPES.has(type)) throw new InvalidRequest("event type is invalid");
          return send(response,201,await store.appendEvent(ownerId,threadId,turnId,id(value.eventId,"event id"),type,value.payload));
        }
        if (request.method === "POST" && url.pathname === "/internal/v1/chat/approvals") {
          if (!(["shell","write_file"] as unknown[]).includes(value.operation) || !DIGEST.test(String(value.paramsDigest)) ||
              typeof value.expiresAt !== "string") throw new InvalidRequest("approval request is invalid");
          return send(response,201,await store.requestApproval({ ownerId,threadId,turnId,
            requestId:id(value.requestId,"request id"),operation:value.operation as "shell" | "write_file",
            paramsDigest:value.paramsDigest as string,expiresAt:value.expiresAt }));
        }
        return send(response,404,{ error:"not_found" });
      }
      const principal = await verifyUser(token);
      const ownerId = await store.owner(principal.issuer,principal.subject);
      if (request.method === "POST" && url.pathname === "/v1/threads") {
        return send(response,201,await store.createThread(ownerId,threadInput(await body(request)),key(request)));
      }
      if (request.method === "GET" && url.pathname === "/v1/threads") {
        return send(response,200,{ items:await store.threads(ownerId) });
      }
      const thread = /^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/.exec(url.pathname);
      if (request.method === "GET" && thread) return send(response,200,await store.thread(ownerId,thread[1]));
      const fork = /^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/fork$/.exec(url.pathname);
      if (request.method === "POST" && fork) {
        const parent = await store.thread(ownerId,fork[1]);
        const value = await body(request);
        return send(response,201,await store.createThread(ownerId,{
          runtime:parent.runtime as ThreadInput["runtime"],model:String(parent.model),
          assistantProfile:String(parent.assistant_profile),
          ...(parent.skill_profile ? { skillProfile:String(parent.skill_profile) } : {}),
          parentThreadId:fork[1],
          ...(value.threadId === undefined ? {} : { threadId:id(value.threadId,"thread id") })
        },key(request)));
      }
      const messages = /^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/messages$/.exec(url.pathname);
      if (request.method === "POST" && messages) {
        const value = await body(request);
        if (typeof value.content !== "string" || !value.content.trim() || value.content.length > 50_000) {
          throw new InvalidRequest("message content is invalid");
        }
        return send(response,202,await store.message(ownerId,messages[1],value.content,key(request)));
      }
      const events = /^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/events$/.exec(url.pathname);
      if (request.method === "GET" && events) {
        const cursor = Number(url.searchParams.get("cursor") ?? "-1");
        const limit = Number(url.searchParams.get("limit") ?? "200");
        if (!Number.isInteger(cursor) || cursor < -1 || !Number.isInteger(limit) || limit < 1 || limit > 200) {
          throw new InvalidRequest("event cursor or limit is invalid");
        }
        const rows = await store.events(ownerId,events[1],cursor,limit);
        response.writeHead(200,{ "Content-Type":"text/event-stream", "Cache-Control":"no-cache", "X-Accel-Buffering":"no" });
        for (const row of rows) response.write("id: " + row.seq + "\nevent: " + row.event_type + "\ndata: " + JSON.stringify(row) + "\n\n");
        response.end();
        return;
      }
      const approval = /^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/turns\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/approvals\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/.exec(url.pathname);
      const cancel = /^\/v1\/threads\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/turns\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/cancel$/.exec(url.pathname);
      if (request.method === "POST" && cancel) {
        return send(response,200,await store.cancelQueuedTurn(ownerId,cancel[1],cancel[2]));
      }
      if (request.method === "POST" && approval) {
        const value = await body(request);
        if (typeof value.approved !== "boolean" || typeof value.paramsDigest !== "string" || !DIGEST.test(value.paramsDigest)) {
          throw new InvalidRequest("approval decision is invalid");
        }
        return send(response,200,await store.decideApproval(ownerId,approval[1],approval[2],approval[3],value.paramsDigest,value.approved));
      }
      send(response,404,{ error:"not_found" });
    } catch (error) {
      const status = error instanceof ChatNotFound ? 404 : error instanceof ChatConflict ? 409 :
        error instanceof SyntaxError || error instanceof InvalidRequest ? 400 :
        error instanceof Error && ["authentication required","unauthorized"].includes(error.message) ? 401 : 503;
      send(response,status,{ error:status === 401 ? "unauthorized" : status === 404 ? "not_found" :
        status === 409 ? "conflict" : status === 400 ? "invalid_request" : "unavailable" });
    }
  });
}
