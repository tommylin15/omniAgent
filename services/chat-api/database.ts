import type { PoolConfig } from "pg";

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
