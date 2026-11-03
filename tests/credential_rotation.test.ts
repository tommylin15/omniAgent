import {describe,it,expect,vi} from "vitest";
import {CredentialManager,CredentialRegistry} from "../services/chat-api/credential_management.js";
import type {SecretVault} from "../services/chat-api/credential_vault.js";
const owner="00000000-0000-4000-8000-000000000001",profile="00000000-0000-4000-8000-000000000002";
const operation="00000000-0000-4000-8000-000000000003",resource="00000000-0000-4000-8000-000000000004";
const value="replacement-secret-long-enough",old="projects/test/secrets/old/versions/1";
type Row={owner_id:string;profile_id:string;operation_id:string;resource_id:string;status:string;
 old_reference:string;new_reference:string;key_sha256:string;updated_at:string;fence:number};
function fixture(){
 let row:Row|undefined,active=old,leased=false;const secrets=new Map<string,string>([[old,'old-secret-fixture-long-enough']]);
 const registry={
  reserveRotation:vi.fn(async(o:string,p:string,k:string,digest:string,ref:(id:string)=>string)=>{
   if(o!==owner||p!==profile)throw new Error("unavailable");
   if(row){if(row.key_sha256!==digest||k!==operation)throw new Error("intent conflict");return {...row};}
   row={owner_id:o,profile_id:p,operation_id:operation,resource_id:resource,status:"RESERVED",old_reference:old,
    new_reference:ref(resource),key_sha256:digest,updated_at:"fixture",fence:0};return {...row};
  }),
  rotation:vi.fn(async(o:string,_id:string)=>{if(o!==owner||!row)throw new Error("unavailable");return {...row};}),
  claimRotation:vi.fn(async(_r:Row,create:boolean)=>{
   if(!row||leased||["COMPLETED","ROLLED_BACK"].includes(row.status)||(!create&&row.status==="RESERVED"))return null;
   leased=true;row.fence++;if(row.status==="RESERVED")row.status="PROVISIONING";return {...row};
  }),
  rotationState:vi.fn(async(r:Row,status:string,release:boolean)=>{
   if(!row||r.fence!==row.fence||!leased)throw new Error("lease lost");row.status=status;
   if(release)leased=false;return {...row};
  }),
  switchRotation:vi.fn(async(r:Row)=>{
   if(!row||active!==r.old_reference)throw new Error("CAS conflict");
   active=r.new_reference;row.status="CLEANUP";return {...row};
  })
 };
 const vault:SecretVault={reference:id=>`projects/test/secrets/candidate-${id}/versions/1`,
  create:vi.fn(async(id:string,key:string)=>{const ref=vault.reference(id);secrets.set(ref,key);return ref;}),
  access:vi.fn(async(ref:string)=>{const key=secrets.get(ref);if(!key)throw new Error("unavailable");return key;}),
  inspect:vi.fn(async(ref:string)=>secrets.has(ref)?"enabled" as const:"missing" as const),
  disable:vi.fn(async()=>undefined),discard:vi.fn(async(ref:string)=>{secrets.delete(ref);})};
 const manager=new CredentialManager(registry as unknown as CredentialRegistry,vault);
 return {registry,vault,manager,secrets,get row(){return row;},get active(){return active;}};
}
describe("distributed BYOK replacement and reconciliation",()=>{
 it("verifies new bytes before switching and retires the old version only after CAS",async()=>{
  const f=fixture();vi.mocked(f.vault.disable).mockImplementation(async ref=>{
   expect(ref).toBe(old);expect(f.active).toBe(f.row!.new_reference);
  });
  const receipt=await f.manager.replace(owner,profile,value,operation);
  expect(receipt.status).toBe("COMPLETED");expect(f.vault.create).toHaveBeenCalledOnce();
  expect(vi.mocked(f.vault.access!).mock.invocationCallOrder[0]).toBeLessThan(f.registry.switchRotation.mock.invocationCallOrder[0]);
  expect(JSON.stringify(receipt)).not.toContain(value);expect(JSON.stringify(receipt)).not.toContain("projects/");
 });
 it("reconciles unknown create outcome by readback without repeating creation",async()=>{
  const f=fixture();vi.mocked(f.vault.create).mockImplementationOnce(async(id,key)=>{
   f.secrets.set(f.vault.reference(id),key);throw new Error("transport response lost");
  });
  expect(await f.manager.replace(owner,profile,value,operation)).toMatchObject({status:"UNKNOWN"});
  expect(f.active).toBe(old);expect(f.vault.disable).not.toHaveBeenCalled();
  expect(await f.manager.reconcile(owner,operation)).toMatchObject({status:"COMPLETED"});
  expect(f.vault.create).toHaveBeenCalledOnce();
 });
 it("keeps the switched key active when old version cleanup fails",async()=>{
  const f=fixture();vi.mocked(f.vault.disable).mockRejectedValueOnce(new Error("outage"));
  expect(await f.manager.replace(owner,profile,value,operation)).toMatchObject({status:"CLEANUP"});
  expect(f.active).toBe(f.row!.new_reference);
  expect(await f.manager.reconcile(owner,operation)).toMatchObject({status:"COMPLETED"});
  expect(f.vault.discard).not.toHaveBeenCalled();expect(f.vault.create).toHaveBeenCalledOnce();
 });
 it("rolls back a candidate with mismatched verified bytes and preserves the old key",async()=>{
  const f=fixture();vi.mocked(f.vault.access!).mockResolvedValueOnce("different-secret-long-enough");
  expect(await f.manager.replace(owner,profile,value,operation)).toMatchObject({status:"ROLLED_BACK"});
  expect(f.active).toBe(old);expect(f.registry.switchRotation).not.toHaveBeenCalled();
  expect(f.vault.disable).not.toHaveBeenCalled();expect(f.vault.discard).toHaveBeenCalledWith(f.row!.new_reference);
 });
 it("cleans up a unique candidate after a create failure proven missing",async()=>{
  const f=fixture();vi.mocked(f.vault.create).mockRejectedValueOnce(new Error("failure"));
  await f.manager.replace(owner,profile,value,operation);
  expect(await f.manager.reconcile(owner,operation)).toMatchObject({status:"ROLLED_BACK"});
  expect(f.active).toBe(old);expect(f.vault.disable).not.toHaveBeenCalled();
 });
 it("does not repeat an idempotent replacement or accept changed key intent",async()=>{
  const f=fixture();await f.manager.replace(owner,profile,value,operation);
  await f.manager.replace(owner,profile,value,operation);expect(f.vault.create).toHaveBeenCalledOnce();
  await expect(f.manager.replace(owner,profile,value+"changed",operation)).rejects.toThrow("intent conflict");
 });
 it("accepts independently confirmed old-version retirement without repeating disable",async()=>{
  const f=fixture();vi.mocked(f.vault.inspect!).mockImplementation(async ref=>ref===old?"disabled":"enabled");
  expect(await f.manager.replace(owner,profile,value,operation)).toMatchObject({status:"COMPLETED"});
  expect(f.vault.disable).not.toHaveBeenCalled();expect(f.active).toBe(f.row!.new_reference);
 });
 it("requires readback support before reserving metadata and denies another Owner",async()=>{
  const f=fixture();delete f.vault.access;
  await expect(f.manager.replace(owner,profile,value,operation)).rejects.toThrow("readback unavailable");
  expect(f.registry.reserveRotation).not.toHaveBeenCalled();
  await expect(f.manager.reconcile(profile,operation)).rejects.toThrow();
 });
});
