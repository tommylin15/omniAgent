import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ChatConflict, ChatNotFound } from "./storage.js";
import type { ByokProvider, SecretVault } from "./credential_vault.js";

export type CredentialStatus = "PENDING" | "ACTIVE" | "REVOKING" | "REVOKED";
export type CredentialPublic = { profile_id: string; provider: ByokProvider; status: CredentialStatus; created_at: string };
export type CredentialRecord = CredentialPublic & { secret_version: string };

export class CredentialRegistry {
  constructor(private readonly pool: Pool) {}

  async reserve(ownerId: string, profileId: string, provider: ByokProvider, secretVersion: string): Promise<void> {
    await this.pool.query(`INSERT INTO omni_chat.credential_profiles
       (owner_id,profile_id,provider,secret_version,status)
       VALUES($1,$2,$3,$4,'PENDING')`,
      [ownerId,profileId,provider,secretVersion]);
  }

  async activate(ownerId: string, profileId: string): Promise<CredentialPublic> {
    const rows = (await this.pool.query(
      `UPDATE omni_chat.credential_profiles SET status='ACTIVE',updated_at=now()
       WHERE owner_id=$1 AND profile_id=$2 AND status='PENDING'
       RETURNING profile_id,provider,status,created_at`,[ownerId,profileId])).rows;
    if (rows.length !== 1) throw new ChatConflict("BYOK state transition conflict");
    return rows[0] as CredentialPublic;
  }

  async list(ownerId: string): Promise<CredentialPublic[]> {
    return (await this.pool.query(
      `SELECT profile_id,provider,status,created_at FROM omni_chat.credential_profiles
       WHERE owner_id=$1 ORDER BY created_at,profile_id LIMIT 100`,[ownerId])).rows as CredentialPublic[];
  }

  async beginRevoke(ownerId: string, profileId: string): Promise<CredentialRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query(
        `SELECT profile_id,provider,status,secret_version,created_at
         FROM omni_chat.credential_profiles
         WHERE owner_id=$1 AND profile_id=$2 FOR UPDATE`,
        [ownerId,profileId])).rows[0] as CredentialRecord | undefined;
      if (!row) throw new ChatNotFound("BYOK profile unavailable");
      if (row.status === "ACTIVE" || row.status === "PENDING") {
        await client.query(
          `UPDATE omni_chat.credential_profiles SET status='REVOKING',updated_at=now()
           WHERE owner_id=$1 AND profile_id=$2`,[ownerId,profileId]);
      }
      await client.query("COMMIT");
      return { ...row,status:row.status === "REVOKED" ? "REVOKED" : "REVOKING" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async finalizeRevoke(ownerId: string, profileId: string): Promise<CredentialPublic> {
    const row = (await this.pool.query(
      `UPDATE omni_chat.credential_profiles SET status='REVOKED',updated_at=now()
       WHERE owner_id=$1 AND profile_id=$2 AND status IN ('REVOKING','REVOKED')
       RETURNING profile_id,provider,status,created_at`,[ownerId,profileId])).rows[0];
    if (!row) throw new ChatConflict("BYOK revocation state conflict");
    return row as CredentialPublic;
  }

  // Internal-only non-secret locator, never returned by /v1/credentials.
  async resolveRef(ownerId: string, provider: ByokProvider, profileId: string): Promise<string> {
    const row = (await this.pool.query(
      `SELECT secret_version FROM omni_chat.credential_profiles
       WHERE owner_id=$1 AND profile_id=$2 AND provider=$3 AND status='ACTIVE'`,
      [ownerId,profileId,provider])).rows[0];
    if (!row) throw new ChatNotFound("BYOK credential unavailable");
    return String(row.secret_version);
  }
}

export class CredentialManager {
  constructor(private readonly registry: CredentialRegistry,
              private readonly vault: SecretVault) {}

  async create(ownerId: string, provider: ByokProvider, value: string): Promise<CredentialPublic> {
    if (!["gemini","openrouter"].includes(provider)) throw new Error("BYOK provider invalid");
    if (typeof value !== "string" || value.length < 16 || value.length > 4096 ||
        value.trim() !== value || /[\r\n\0]/.test(value))
      throw new Error("BYOK value invalid");
    const profileId = randomUUID();
    const reference = this.vault.reference(profileId);
    // Reserve first: a crash cannot lose the expected server-generated Secret
    // locator. PENDING rows are never usable for inference.
    await this.registry.reserve(ownerId,profileId,provider,reference);
    try {
      const created = await this.vault.create(profileId,value);
      if (created !== reference) throw new Error("BYOK vault version mismatch");
      return await this.registry.activate(ownerId,profileId);
    } catch {
      // PENDING remains non-executable and auditable for recovery. The app
      // must not silently reuse or infer success after an uncertain write.
      throw new Error("BYOK provisioning requires reconciliation");
    }
  }

  list(ownerId: string): Promise<CredentialPublic[]> { return this.registry.list(ownerId); }

  async revoke(ownerId: string, profileId: string): Promise<CredentialPublic> {
    const row = await this.registry.beginRevoke(ownerId,profileId);
    if (row.status === "REVOKED") {
      return { profile_id:row.profile_id,provider:row.provider,status:"REVOKED",
        created_at:row.created_at };
    }
    // Denial becomes durable BEFORE external revocation. An API failure
    // leaves REVOKING (not usable), and can be retried safely by an operator.
    await this.vault.disable(row.secret_version);
    return this.registry.finalizeRevoke(ownerId,profileId);
  }
}
