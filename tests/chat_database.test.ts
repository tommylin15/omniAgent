import { describe, expect, it } from "vitest";
import { chatDatabasePoolConfig } from "../services/chat-api/database.js";

describe("chatDatabasePoolConfig", () => {
  it("keeps the default PostgreSQL connection string unchanged", () => {
    const dsn = "postgresql://app:secret@10.0.0.5:5432/chat?sslmode=require";
    const config = chatDatabasePoolConfig(dsn);
    expect(config.connectionString).toBe(dsn);
    expect(config.ssl).toBeUndefined();
    expect(config.max).toBe(5);
    expect(config.connectionTimeoutMillis).toBe(5_000);
  });

  it("uses TLS encryption without CA verification for an explicitly private self-signed dev endpoint", () => {
    const config = chatDatabasePoolConfig(
      "postgresql://app:secret@10.0.0.5:5432/chat?sslmode=require",
      "private-self-signed"
    );
    expect(config.connectionString).toBe("postgresql://app:secret@10.0.0.5:5432/chat");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("fails closed when private self-signed mode is not paired with sslmode=require", () => {
    expect(() => chatDatabasePoolConfig(
      "postgresql://app:secret@10.0.0.5:5432/chat",
      "private-self-signed"
    )).toThrow(/sslmode=require/);
  });

  it("fails closed for an unknown TLS mode", () => {
    expect(() => chatDatabasePoolConfig(
      "postgresql://app:secret@10.0.0.5:5432/chat?sslmode=require",
      "anything-else"
    )).toThrow(/unsupported/);
  });
});
