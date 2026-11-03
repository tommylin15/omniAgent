import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import pg from "pg";

const chatFiles=["010_agent_admin_settings_draft.sql","011_agent_runtime.sql",
  "013_data_lifecycle_jobs.sql","014_groq_runtime.sql","015_thread_credentials.sql",
  "016_turn_execution_mode.sql","017_credential_rotation.sql","018_paid_chat_profile.sql","019_agent_admin_access.sql","020_message_intents.sql"];
const gatewayFiles=["008_router_usage_telemetry.sql","012_paid_model_budget.sql","021_provider_receipts.sql"];
const args=process.argv.slice(2),mode=args[0];
if(!["chat","gateway"].includes(mode)||args.some((x,i)=>i>0&&x!=="--apply"))
  throw Error("Usage: node scripts/migrate-product.mjs chat|gateway [--apply]");
const files=mode==="chat"?chatFiles:gatewayFiles;
const sources=await Promise.all(files.map(async name=>({name,
  sql:await readFile(new URL(`../infra/postgres/migrations/${name}`,import.meta.url),"utf8")})));
if(!args.includes("--apply")){
  console.log(JSON.stringify({status:"plan_only",target:mode,files:files,requires:"explicit database name, verified CA and operator-approved migration role"}));
}else{
  const dsn=process.env.PRODUCT_MIGRATION_DATABASE_URL,ca=process.env.PRODUCT_MIGRATION_CA_PEM,
    hostname=process.env.PRODUCT_MIGRATION_TLS_SERVERNAME;
  if(!dsn||!ca?.includes("-----BEGIN CERTIFICATE-----")||!hostname||!/^[a-z0-9.-]{1,253}$/i.test(hostname))
    throw Error("verified database migration connection missing");
  const url=new URL(dsn),expected=mode==="chat"?"omniagent_chat":"omniagent_gateway";
  if(!["postgres:","postgresql:"].includes(url.protocol)||url.pathname!==`/${expected}`)
    throw Error("database not approved for this migration group");
  for(const key of ["sslmode","sslcert","sslkey","sslrootcert"])url.searchParams.delete(key);
  const pool=new pg.Pool({connectionString:url.toString(),ssl:{ca,rejectUnauthorized:true,servername:hostname},
    max:1,connectionTimeoutMillis:5000,query_timeout:30000});
  const db=await pool.connect();
  try{
    if((await db.query("SELECT current_database() AS name")).rows[0].name!==expected)throw Error("database mismatch");
    await db.query("SELECT pg_advisory_lock(762014, 1102)");
    // Gateway migrations own their schema; the receipt table lives in public for both databases.
    await db.query(`CREATE TABLE IF NOT EXISTS public.omniagent_product_migrations
      (filename text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
    for(const {name,sql}of sources){
      const digest=createHash("sha256").update(sql).digest("hex");
      const previous=(await db.query("SELECT sha256 FROM public.omniagent_product_migrations WHERE filename=$1",[name])).rows[0];
      if(previous){if(previous.sha256!==digest)throw Error("previously applied migration changed");continue;}
      await db.query(sql);
      await db.query("INSERT INTO public.omniagent_product_migrations(filename,sha256) VALUES($1,$2)",[name,digest]);
      console.log(JSON.stringify({migration:name,status:"applied",sha256:digest}));
    }
  }finally{await db.query("SELECT pg_advisory_unlock(762014, 1102)").catch(()=>{});db.release();await pool.end();}
}
