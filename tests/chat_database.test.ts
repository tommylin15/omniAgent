import { describe, expect, it } from "vitest";
import { chatDatabasePoolConfig, chatDatabaseUrl } from "../services/chat-api/database.js";

describe("chatDatabaseUrl", () => {
  it("loads only the dedicated database field from the unified JSON bundle", () => {
    const dsn = "postgresql://omniagent_chat_app:fake@10.0.0.5:5432/omniagent_chat?sslmode=require";
    const bundle = JSON.stringify({ gemini_api_key: "fake-key", openrouter_api_key: "fake-key",
      mcp_owner_signing_key: "a".repeat(64), chat_database_url: dsn });
    expect(chatDatabaseUrl({ OMNIAGENT_BUNDLE: bundle })).toBe(dsn);
    expect(chatDatabaseUrl({ CHAT_DATABASE_URL: dsn })).toBe(dsn);
  });

  it("fails closed for malformed or incomplete bundle instead of using legacy fallback", () => {
    const legacy = "postgresql://legacy:fake@localhost/db";
    expect(() => chatDatabaseUrl({ OMNIAGENT_BUNDLE: "{", CHAT_DATABASE_URL: legacy })).toThrow(/invalid/);
    expect(() => chatDatabaseUrl({ OMNIAGENT_BUNDLE: "{}", CHAT_DATABASE_URL: legacy })).toThrow(/not configured/);
    expect(() => chatDatabaseUrl({ OMNIAGENT_BUNDLE: '{"chat_database_url":"not-a-url"}' })).toThrow(/not configured/);
  });
});

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
