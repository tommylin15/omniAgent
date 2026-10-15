import type { PoolConfig } from "pg";
import { isIP } from "node:net";

export function chatDatabaseUrl(env: { OMNIAGENT_BUNDLE?: string; CHAT_DATABASE_URL?: string }): string {
  // Legacy revisions continue using a pinned direct DSN. New candidates must use
  // the JSON bundle, never treat the entire JSON payload as a database URL.
  if (env.OMNIAGENT_BUNDLE !== undefined) {
    let parsed: unknown;
    try { parsed = JSON.parse(env.OMNIAGENT_BUNDLE); }
    catch { throw new Error("invalid omniAgent credential bundle"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid omniAgent credential bundle");
    }
    const dsn = (parsed as Record<string, unknown>).chat_database_url;
    if (typeof dsn !== "string" || !/^postgres(?:ql)?:\/\//.test(dsn)) {
      throw new Error("unified Chat database connection is not configured");
    }
    return dsn;
  }
  return env.CHAT_DATABASE_URL ?? "";
}

export function chatDatabasePoolConfig(dsn: string, tlsMode?: string,
  caPem?: string, tlsServername?: string): PoolConfig {
  const base: PoolConfig = {
    max: 5,
    connectionTimeoutMillis: 5_000
  };

  if (!tlsMode || tlsMode === "default") {
    return { ...base, connectionString: dsn };
  }

  if (tlsMode !== "private-self-signed" && tlsMode !== "verified-ca") {
    throw new Error("unsupported Chat database TLS mode");
  }

  const url = new URL(dsn);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Chat database URL must use PostgreSQL");
  }
  if (url.searchParams.get("sslmode") !== "require") {
    throw new Error("Chat database TLS requires sslmode=require");
  }

  // node-postgres parses sslmode from the DSN and may override the supplied
  // ssl object. Remove it so the explicit CA and hostname are authoritative.
  url.searchParams.delete("sslmode");
  if (tlsMode === "verified-ca") {
    const hostname = tlsServername || url.hostname;
    if (!caPem?.includes("-----BEGIN CERTIFICATE-----") ||
        !caPem.includes("-----END CERTIFICATE-----") ||
        !/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(hostname) ||
        (isIP(url.hostname) !== 0 && !tlsServername)) {
      throw new Error("verified CA or database TLS hostname is not configured");
    }
    return { ...base, connectionString: url.toString(),
      ssl: { rejectUnauthorized: true, ca: caPem, servername: hostname } };
  }
  // Legacy private-only dev compatibility. This mode does NOT authenticate
  // the server and must be retired after the active GCP TLS CA is available.
  return { ...base, connectionString: url.toString(),
    ssl: { rejectUnauthorized: false } };
}
