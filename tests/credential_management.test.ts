import { describe, expect, it, vi } from "vitest";
import { CredentialManager, CredentialRegistry } from "../services/chat-api/credential_management.js";
import { GoogleSecretManagerVault, type SecretVault } from "../services/chat-api/credential_vault.js";

const owner="00000000-0000-4000-8000-000000000001";
const other="00000000-0000-4000-8000-000000000002";
const key="fixture-provider-secret-with-length";
function harness() {
  const states=new Map<string,{ownerId:string;provider:"gemini"|"openrouter";status:string;reference:string}>();
  const registry={
    reserve:vi.fn(async (ownerId:string,profileId:string,provider:"gemini"|"openrouter",ref:string) => {
      states.set(profileId,{ownerId,provider,status:"PENDING",reference:ref});
    }),
    activate:vi.fn(async (ownerId:string,profileId:string) => {
      const value=states.get(profileId);
      if (!value || value.ownerId!==ownerId || value.status!=="PENDING") throw new Error("blocked");
      value.status="ACTIVE";
      return {profile_id:profileId,provider:value.provider,status:"ACTIVE" as const,created_at:"fixture"};
    }),
    list:vi.fn(async (ownerId:string) => [...states.entries()].filter(([,v])=>v.ownerId===ownerId)
      .map(([profile_id,v])=>({profile_id,provider:v.provider,status:v.status,created_at:"fixture"}))),
    beginRevoke:vi.fn(async (ownerId:string,profileId:string) => {
      const v=states.get(profileId);
      if (!v || v.ownerId!==ownerId) throw new Error("not found");
      v.status="REVOKING";
      return {profile_id:profileId,provider:v.provider,status:"REVOKING" as const,created_at:"fixture",secret_version:v.reference};
    }),
    finalizeRevoke:vi.fn(async (ownerId:string,profileId:string) => {
      const v=states.get(profileId);
      if (!v || v.ownerId!==ownerId) throw new Error("not found");
      v.status="REVOKED";
      return {profile_id:profileId,provider:v.provider,status:"REVOKED" as const,created_at:"fixture"};
    })
  };
  const vault:SecretVault={
    reference:vi.fn((profileId:string) => "projects/test-project/secrets/omniagent-byok-"+profileId.replace(/-/g,"")+"/versions/1"),
    create:vi.fn(async (profileId:string,_value:string) => vault.reference(profileId)),
    disable:vi.fn(async (_reference:string) => undefined)
  };
  return {states,registry,vault,manager:new CredentialManager(registry as unknown as CredentialRegistry,vault)};
}
describe("BYOK credential lifecycle fail-closed fixtures",()=>{
  it("reserves a PENDING owner-scoped record before vault storage and publishes no raw key",async()=>{
    const f=harness();
    const created=await f.manager.create(owner,"gemini",key);
    expect(created).toMatchObject({provider:"gemini",status:"ACTIVE"});
    expect(f.registry.reserve).toHaveBeenCalledOnce();
    expect(f.vault.create).toHaveBeenCalledWith(created.profile_id,key);
    expect(JSON.stringify(created)).not.toContain(key);
    expect(JSON.stringify(await f.manager.list(owner))).not.toContain("secret_version");
    expect(await f.manager.list(other)).toEqual([]);
    await expect(f.manager.revoke(other,created.profile_id)).rejects.toThrow();
    expect(f.vault.disable).not.toHaveBeenCalled();
    const revoked=await f.manager.revoke(owner,created.profile_id);
    expect(revoked.status).toBe("REVOKED");
    expect(f.vault.disable).toHaveBeenCalledOnce();
  });
  it("keeps the database PENDING and never returns a secret after vault or activation failure",async()=>{
    const f=harness();
    vi.mocked(f.vault.create).mockRejectedValueOnce(new Error("external error with key "+key));
    await expect(f.manager.create(owner,"gemini",key)).rejects.toThrow("requires reconciliation");
    expect(f.registry.activate).not.toHaveBeenCalled();
    expect([...f.states.values()][0].status).toBe("PENDING");
    const g=harness();
    g.registry.activate.mockRejectedValueOnce(new Error("database failure"));
    await expect(g.manager.create(owner,"gemini",key)).rejects.toThrow("requires reconciliation");
    expect([...g.states.values()][0].status).toBe("PENDING");
  });
  it("denies invalid provider or secret before creating metadata",async()=>{
    const f=harness();
    await expect(f.manager.create(owner,"gemini","short")).rejects.toThrow("value invalid");
    await expect(f.manager.create(owner,"codex" as "gemini",key)).rejects.toThrow("provider invalid");
    expect(f.registry.reserve).not.toHaveBeenCalled();
    expect(f.vault.create).not.toHaveBeenCalled();
  });
  it("blocks unknown Secret Manager resource versions without remote access",async()=>{
    const vault=new GoogleSecretManagerVault("test-project",vi.fn() as unknown as typeof fetch);
    const ref=vault.reference("00000000-0000-4000-8000-000000000003");
    expect(ref).toMatch(/^projects\/test-project\/secrets\/omniagent-byok-[a-f0-9]{32}\/versions\/1$/);
    await expect(vault.disable("projects/foreign/secrets/unauthorized/versions/1"))
      .rejects.toThrow("reference is invalid");
  });
});
