/**
 * RUA-02B credentials belong to the existing omniagent-bundle secret.
 * Each service selects its own least-privileged PostgreSQL role, but since
 * both services receive one shared JSON Secret, this is NOT Secret-level
 * isolation. Never log the bundle, DSNs, certificates or raw parse errors.
 */
export type RouterUsageConnection={databaseUrl:string;caPem:string;tlsServername:string};

export function routerUsageBundleConnection(raw:string|undefined,
  role:"writer"|"reader"):RouterUsageConnection|undefined {
  if(raw===undefined || raw==="")return undefined;
  let payload:unknown;
  try {payload=JSON.parse(raw);} catch {throw Error("router_usage_bundle_invalid");}
  if(!payload || typeof payload!=="object" || Array.isArray(payload))
    throw Error("router_usage_bundle_invalid");
  const group=(payload as Record<string,unknown>).router_usage;
  if(group===undefined)return undefined; // Existing pre-RUA bundle.
  if(!group || typeof group!=="object" || Array.isArray(group))
    throw Error("router_usage_bundle_invalid");
  const cfg=group as Record<string,unknown>;
  const allowed=["writer_database_url","reader_database_url","ca_pem","tls_servername"];
  if(Object.keys(cfg).some(k=>!allowed.includes(k)) ||
     allowed.some(k=>typeof cfg[k]!=="string" || !(cfg[k] as string).trim()))
    throw Error("router_usage_bundle_invalid");
  const dsn=cfg[role+"_database_url"] as string;
  let url:URL;
  try {url=new URL(dsn);} catch {throw Error("router_usage_bundle_invalid");}
  const expectedUser=role==="writer"?"omniagent_usage_writer":"omniagent_usage_reader";
  if(!["postgres:","postgresql:"].includes(url.protocol) ||
      decodeURIComponent(url.username)!==expectedUser || !url.password ||
      url.pathname!=="/omniagent_gateway" || url.searchParams.get("sslmode")!=="require" ||
      url.searchParams.size!==1 || !url.hostname)
    throw Error("router_usage_bundle_invalid");
  const ca=cfg.ca_pem as string,servername=cfg.tls_servername as string;
  if(!ca.includes("-----BEGIN CERTIFICATE-----") ||
     !ca.includes("-----END CERTIFICATE-----") ||
     ca.length>16000 ||
     !/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(servername))
    throw Error("router_usage_bundle_invalid");
  return {databaseUrl:dsn,caPem:ca,tlsServername:servername};
}
