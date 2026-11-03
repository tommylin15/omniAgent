import { GoogleAuth } from "google-auth-library";

export type ByokProvider = "gemini" | "openrouter" | "groq";
export type SecretVault = {
  reference(profileId: string): string;
  create(profileId: string, rawKey: string): Promise<string>;
  disable(versionName: string): Promise<void>;
  access?(versionName:string):Promise<string>;
  inspect?(versionName:string):Promise<"enabled"|"disabled"|"missing">;
  discard?(versionName:string):Promise<void>;
};

// An ephemeral key may enter ONLY this boundary; DB rows, events, headers,
// error messages and API responses must never contain it.
export class GoogleSecretManagerVault implements SecretVault {
  private readonly auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  constructor(private readonly project: string, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(project)) throw new Error("BYOK project is invalid");
  }

  private name(profileId: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId))
      throw new Error("BYOK profile identifier is invalid");
    return `projects/${this.project}/secrets/omniagent-byok-${profileId.replace(/-/g,"").toLowerCase()}`;
  }

  reference(profileId: string): string { return this.name(profileId) + "/versions/1"; }

  private async request(path: string, method: "POST" | "DELETE", body?: object): Promise<Record<string,unknown>> {
    const token = await (await this.auth.getClient()).getAccessToken();
    if (!token.token) throw new Error("BYOK vault identity unavailable");
    let response: Response;
    try {
      response = await this.fetcher("https://secretmanager.googleapis.com/v1/" + path, {
        method, signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${token.token}`, "Content-Type":"application/json" },
        ...(body ? {body: JSON.stringify(body)} : {})
      });
    } catch { throw new Error("BYOK vault transport unavailable"); }
    if (!response.ok) throw new Error("BYOK vault operation unavailable");
    if (method === "DELETE") return {};
    try {
      const parsed: unknown = await response.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("unexpected");
      return parsed as Record<string,unknown>;
    } catch { throw new Error("BYOK vault response invalid"); }
  }

  async create(profileId: string, rawKey: string): Promise<string> {
    if (typeof rawKey !== "string" || rawKey.trim() !== rawKey ||
        rawKey.length < 16 || Buffer.byteLength(rawKey,"utf8") > 4096 ||
        /[\r\n\0]/.test(rawKey)) throw new Error("BYOK value is invalid");
    const secretName = this.name(profileId);
    const secretId = secretName.slice(secretName.lastIndexOf("/") + 1);
    const secret = await this.request(`projects/${this.project}/secrets?secretId=${secretId}`,
      "POST",{replication:{automatic:{}}});
    if (secret.name !== secretName) throw new Error("BYOK secret resource mismatch");
    try {
      const version = await this.request(`${secretName}:addVersion`, "POST",
        {payload:{data:Buffer.from(rawKey,"utf8").toString("base64")}});
      if (version.name !== `${secretName}/versions/1`)
        throw new Error("BYOK version resource mismatch");
      return String(version.name);
    } catch {
      // This is a newly created, server-generated unique resource. If cleanup
      // fails it remains detectable via the reserved PENDING database row.
      await this.request(secretName,"DELETE").catch(() => undefined);
      throw new Error("BYOK vault provisioning failed");
    }
  }

  async disable(versionName: string): Promise<void> {
    const pattern = new RegExp("^projects/" + this.project +
      "/secrets/omniagent-byok-[a-f0-9]{32}/versions/1$");
    if (!pattern.test(versionName)) throw new Error("BYOK reference is invalid");
    await this.request(versionName + ":disable", "POST",{});
  }

  async access(versionName:string):Promise<string>{
    const pattern=new RegExp("^projects/"+this.project+
      "/secrets/omniagent-byok-[a-f0-9]{32}/versions/1$");
    if(!pattern.test(versionName))throw Error("BYOK reference is invalid");
    const token=await (await this.auth.getClient()).getAccessToken();
    if(!token.token)throw Error("BYOK vault identity unavailable");
    const response=await this.fetcher(`https://secretmanager.googleapis.com/v1/${versionName}:access`,{
      redirect:"error",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token.token}`}});
    if(!response.ok)throw Error("BYOK vault access unavailable");
    const raw=await response.text();
    if(Buffer.byteLength(raw)>8192)throw Error("BYOK vault response invalid");
    const value=JSON.parse(raw) as {name?:unknown;payload?:{data?:unknown;dataCrc32c?:unknown}};
    if(value.name!==versionName||typeof value.payload?.data!=="string")throw Error("BYOK vault response invalid");
    const bytes=Buffer.from(value.payload.data,"base64");
    if(bytes.toString("base64")!==value.payload.data)throw Error("BYOK vault response invalid");
    let crc=0xffffffff;
    for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0x82f63b78:0);}
    if(String((crc^0xffffffff)>>>0)!==String(value.payload.dataCrc32c))throw Error("BYOK vault integrity failure");
    const key=bytes.toString("utf8");
    if(bytes.length<16||bytes.length>4096||Buffer.from(key,"utf8").compare(bytes)!==0||
      key.trim()!==key||/[\r\n\0]/.test(key))throw Error("BYOK vault response invalid");
    return key;
  }

  async inspect(versionName:string):Promise<"enabled"|"disabled"|"missing">{
    const pattern=new RegExp("^projects/"+this.project+"/secrets/omniagent-byok-[a-f0-9]{32}/versions/1$");
    if(!pattern.test(versionName))throw new Error("BYOK reference is invalid");
    const token=await (await this.auth.getClient()).getAccessToken();
    if(!token.token)throw new Error("BYOK vault identity unavailable");
    const response=await this.fetcher(`https://secretmanager.googleapis.com/v1/${versionName}`,{
      redirect:"error",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token.token}`}});
    if(response.status===404)return "missing";
    if(!response.ok)throw new Error("BYOK vault state unavailable");
    const raw=await response.text();if(Buffer.byteLength(raw)>8192)throw new Error("BYOK vault state invalid");
    const value=JSON.parse(raw) as {name?:unknown;state?:unknown};
    if(value.name!==versionName)throw new Error("BYOK vault resource mismatch");
    if(value.state==="ENABLED")return "enabled";
    if(value.state==="DISABLED"||value.state==="DESTROYED")return "disabled";
    throw new Error("BYOK vault state unavailable");
  }

  async discard(versionName:string):Promise<void>{
    const pattern=new RegExp("^projects/"+this.project+"/secrets/omniagent-byok-[a-f0-9]{32}/versions/1$");
    if(!pattern.test(versionName))throw new Error("BYOK reference is invalid");
    const token=await (await this.auth.getClient()).getAccessToken();
    if(!token.token)throw new Error("BYOK vault identity unavailable");
    const resource=versionName.slice(0,-"/versions/1".length);
    const response=await this.fetcher(`https://secretmanager.googleapis.com/v1/${resource}`,{
      method:"DELETE",redirect:"error",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token.token}`}});
    if(!response.ok&&response.status!==404)throw new Error("BYOK candidate cleanup unavailable");
  }
}
