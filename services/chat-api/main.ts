import { OAuth2Client } from "google-auth-library";
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

const server = makeChatServer(new ChatStore(pool),
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
  });

server.listen(Number(process.env.PORT ?? "8080"),"0.0.0.0");
process.once("SIGTERM",() => server.close(() => void pool.end()));
