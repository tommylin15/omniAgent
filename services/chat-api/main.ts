import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { ChatDispatcher, makeSignedGatewayInvoker } from "./gateway_dispatch.js";
import { Pool } from "pg";
import { makeChatServer } from "./server.js";
import { ChatStore } from "./storage.js";
import { chatDatabasePoolConfig, chatDatabaseUrl } from "./database.js";

const dsn = chatDatabaseUrl(process.env);
const userAudience = process.env.OMNIAGENT_GOOGLE_CLIENT_ID;
const serviceAudience = process.env.CHAT_INTERNAL_AUDIENCE;
const callers = new Set((process.env.CHAT_INTERNAL_ALLOWED_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
if (!dsn || !userAudience || !serviceAudience || !callers.size) throw new Error("Chat API authentication or storage is not configured");

const google = new OAuth2Client();
const pool = new Pool(chatDatabasePoolConfig(dsn,process.env.CHAT_DATABASE_TLS_MODE));
const verify = async (token: string, audience: string) => {
  const payload = (await google.verifyIdToken({ idToken: token, audience })).getPayload();
  if (!payload?.sub || !["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) {
    throw new Error("unauthorized");
  }
  return payload;
};

const store = new ChatStore(pool);
let dispatcher: ChatDispatcher | undefined;
if (process.env.CHAT_DISPATCH_ENABLED === "true") {
  // The existing single bundle is the only signing-key source. Never silently
  // enable worker execution on an unaccepted 0% candidate.
  let bundle: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(process.env.OMNIAGENT_BUNDLE ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    bundle = parsed as Record<string, unknown>;
  } catch { throw new Error("Chat dispatch bundle unavailable"); }
  const signingKey = bundle.mcp_owner_signing_key;
  const url = process.env.CHAT_GATEWAY_URL;
  const audience = process.env.CHAT_GATEWAY_AUDIENCE;
  if (typeof signingKey !== "string" || signingKey.length < 32 || !url || !audience) {
    throw new Error("Chat dispatch configuration unavailable");
  }
  const auth = new GoogleAuth();
  dispatcher = new ChatDispatcher(store, makeSignedGatewayInvoker({
    url, audience, signingKey,
    idToken: async () => {
      const client = await auth.getIdTokenClient(audience);
      return client.idTokenProvider.fetchIdToken(audience);
    }
  }));
}
const server = makeChatServer(store,
  async (token) => {
    try {
      const claims = await verify(token,userAudience);
      return { issuer: claims.iss, subject: claims.sub };
    } catch { throw new Error("unauthorized"); }
  },
  async (token) => {
    try {
      const claims = await verify(token,serviceAudience);
      if (claims.email_verified !== true || !claims.email || !callers.has(claims.email.toLowerCase())) {
        throw new Error("unauthorized");
      }
    } catch { throw new Error("unauthorized"); }
  }, dispatcher);

server.listen(Number(process.env.PORT ?? "8080"),"0.0.0.0");
process.once("SIGTERM",() => server.close(() => void pool.end()));
