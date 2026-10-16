import {ChatNotFound,safeRecord} from "./storage.js";
import type {GatewayOperation} from "./gateway_dispatch.js";

type Grant={configRef:string;tools:string[]};
type Policy=Record<string,Record<string,Grant>>;
export type McpOperation="discover"|"call"|"cancel"|"disconnect";
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export class ChatMcp {
  private readonly policy:Policy;
  constructor(raw:string,private readonly rpc:(operation:GatewayOperation,value:Record<string,unknown>)=>Promise<unknown>) {
    const value:unknown=JSON.parse(raw);
    if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error("invalid MCP policy");
    for (const [owner,servers] of Object.entries(value)) {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner) || !servers || typeof servers!=="object" || Array.isArray(servers)) throw new Error("invalid MCP owner policy");
      for (const [server,entry] of Object.entries(servers)) {
        if (!entry || typeof entry!=="object" || Array.isArray(entry)) throw new Error("invalid MCP tool policy");
        const grant=entry as Record<string,unknown>;
        if (!ID.test(server) || typeof grant.configRef!=="string" || !ID.test(grant.configRef) ||
            !Array.isArray(grant.tools) || !grant.tools.length || grant.tools.length>128 ||
            grant.tools.some((tool:unknown)=>typeof tool!=="string" || !tool.startsWith(server+"__") || !/^[A-Za-z0-9._:-]{1,192}$/.test(tool))) throw new Error("invalid MCP tool policy");
      }
    }
    this.policy=value as Policy;
  }

  async execute(ownerId:string,serverId:string,operation:McpOperation,value:Record<string,unknown>):Promise<unknown> {
    const grant=this.policy[ownerId]?.[serverId];
    if (!grant) throw new ChatNotFound("MCP server not granted");
    const allowed=operation==="call"?["requestId","toolName","arguments"]:operation==="cancel"?["requestId"]:[];
    if (Object.keys(value).some(key=>!allowed.includes(key))) throw new SyntaxError("invalid MCP fields");
    if ((operation==="call" || operation==="cancel") && (typeof value.requestId!=="string" || !/^[A-Za-z0-9-]{8,128}$/.test(value.requestId))) throw new SyntaxError("invalid MCP request id");
    if (operation==="call" && !grant.tools.includes(String(value.toolName))) throw new ChatNotFound("MCP tool not granted");
    safeRecord(value);
    return safeRecord(await this.rpc("mcp/"+operation as GatewayOperation,{...value,ownerId,serverId,configRef:grant.configRef,toolGrants:grant.tools}));
  }
}
