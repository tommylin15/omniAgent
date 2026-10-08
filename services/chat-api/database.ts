import type { PoolConfig } from "pg";

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

export function chatDatabasePoolConfig(dsn: string, tlsMode?: string): PoolConfig {
  const base: PoolConfig = {
    max: 5,
    connectionTimeoutMillis: 5_000
  };

  if (!tlsMode || tlsMode === "default") {
    return { ...base, connectionString: dsn };
  }

  if (tlsMode !== "private-self-signed") {
    throw new Error("unsupported Chat database TLS mode");
  }

  const url = new URL(dsn);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Chat database URL must use PostgreSQL");
  }
  if (url.searchParams.get("sslmode") !== "require") {
    throw new Error("private self-signed database TLS requires sslmode=require");
  }

  // node-postgres otherwise verifies the self-signed server certificate and
  // closes the TLS handshake before PostgreSQL authentication. This mode is
  // intentionally limited to the private dev VPC; traffic remains TLS-encrypted.
  url.searchParams.delete("sslmode");
  return {
    ...base,
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false }
  };
}
