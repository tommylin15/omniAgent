import {describe,it,expect,vi} from "vitest";
import {createAgentGatewayRoutes,parseAgentGatewayPolicy,authenticateAgentGateway} from "../services/agent-gateway/agent_routes.js";
const owner="11111111-1111-4111-8111-111111111111";
const identity={ownerId:owner,runId:"22222222-2222-4222-8222-222222222222",requestId:"33333333-3333-4333-8333-333333333333"};
const binding={name:"calendar__read",serverId:"calendar",configRef:"calendar_read",risk:"L0"};
const env={AGENT_GATEWAY_ENABLED:"true",AGENT_GATEWAY_OWNER_POLICY_JSON:JSON.stringify({[owner]:{model:"gemini-2.5-flash",tools:[binding]}})};
describe("Agent Gateway independently authorizes MCP tools",()=>{
  it("rejects mutation levels and ambiguous owner/config maps",()=>{
    expect(()=>parseAgentGatewayPolicy(JSON.stringify({[owner]:{model:"gemini-2.5-flash",tools:[{...binding,risk:"L3"}]}}))).toThrow();
    expect(()=>parseAgentGatewayPolicy(JSON.stringify({[owner]:{model:"gemini-2.5-flash",tools:[{...binding,risk:"L2"}]}}))).toThrow();
    expect(()=>parseAgentGatewayPolicy(JSON.stringify({[owner]:{model:"gemini-2.5-flash",tools:[binding,binding]}}))).toThrow();
  });
  it("does not execute a caller-supplied ungranted name or config",async()=>{
    const mcp={call:vi.fn(),discover:vi.fn()};const routes=createAgentGatewayRoutes(mcp,env);
    await expect(routes.tool({...identity,toolName:"calendar__write",arguments:{}})).rejects.toThrow("denied");
    await expect(routes.tool({...identity,toolName:binding.name,arguments:{},configRef:"evil"})).rejects.toThrow("invalid");
    expect(mcp.call).not.toHaveBeenCalled();
  });
  it("maps allowed tools to backend owner/config grants",async()=>{
    const mcp={call:vi.fn().mockResolvedValue({result:"ok"}),discover:vi.fn()};
    const routes=createAgentGatewayRoutes(mcp,env);
    await routes.tool({...identity,toolName:binding.name,arguments:{}});
    expect(mcp.call).toHaveBeenCalledWith({ownerId:owner,requestId:identity.requestId,
      serverId:binding.serverId,configRef:binding.configRef,toolName:binding.name,toolGrants:[binding.name],arguments:{}});
  });
  it("rejects forged schemas before any paid provider resource is created",async()=>{
    const mcp={call:vi.fn(),discover:vi.fn().mockResolvedValue({tools:[{name:binding.name,description:"Read calendar",
      inputSchema:{type:"object",properties:{}}}]})};
    const routes=createAgentGatewayRoutes(mcp,env);
    await expect(routes.decision({...identity,question:"read",observations:[],maxTokens:100,maxCostMicros:100,
      tools:[{name:binding.name,description:"Read calendar",inputSchema:{type:"object",properties:{write:{type:"boolean"}}}}]},
      new AbortController().signal)).rejects.toThrow("untrusted_tool_schema");
    expect(mcp.call).not.toHaveBeenCalled();
  });
  it("keeps disabled routes inert",async()=>{
    const mcp={call:vi.fn(),discover:vi.fn()};const routes=createAgentGatewayRoutes(mcp,{});
    await expect(routes.tool({...identity,toolName:binding.name,arguments:{}})).rejects.toThrow("disabled");
    expect(mcp.call).not.toHaveBeenCalled();expect(mcp.discover).not.toHaveBeenCalled();
  });
  it("checks verified exact service identity independently of body signatures",async()=>{
    const email="agent-worker@test-project.iam.gserviceaccount.com";
    const config={AGENT_GATEWAY_AUDIENCE:"https://gateway.example",AGENT_GATEWAY_CALLER_EMAILS:email};
    const verify=vi.fn().mockResolvedValue({email,email_verified:true});
    await authenticateAgentGateway("Bearer token",config,verify);
    expect(verify).toHaveBeenCalledWith("token",config.AGENT_GATEWAY_AUDIENCE);
    for(const claim of [{email,email_verified:false},{email:"other@test-project.iam.gserviceaccount.com",email_verified:true}]){
      verify.mockResolvedValueOnce(claim);
      await expect(authenticateAgentGateway("Bearer token",config,verify)).rejects.toThrow();
    }
    await expect(authenticateAgentGateway("Bearer token",{},verify)).rejects.toThrow();
  });
  it("requires fresh durable L2 authorization before mutation and binds owner/run/action",async()=>{
    const second="44444444-4444-4444-8444-444444444444";
    const actionId="55555555-5555-4555-8555-555555555555";
    const l2={...binding,name:"calendar__create",risk:"L2",readbackToolName:"calendar__read",actionIdArgument:"actionId"};
    const policy={model:"gemini-2.5-flash",tools:[l2]};
    const config={...env,AGENT_GATEWAY_OWNER_POLICY_JSON:JSON.stringify({[owner]:policy,[second]:policy})};
    const schema={type:"object",properties:{title:{type:"string"},actionId:{type:"string"}},required:["title","actionId"],additionalProperties:false};
    const mcp={call:vi.fn().mockResolvedValue({result:"written"}),discover:vi.fn(async(input:unknown)=>({tools:[{
      name:(input as {toolGrants:string[]}).toolGrants[0],inputSchema:schema}]}))};
    let used=false;
    const authorizeAction=vi.fn(async(input:Record<string,unknown>)=>{
      if(input.ownerId!==owner||input.runId!==identity.runId||input.actionId!==actionId||
        input.toolName!==l2.name||JSON.stringify(input.arguments)!=='{"title":"test"}')throw Error("receipt_mismatch");
      if(input.operation==="write"){if(used)throw Error("already_claimed");used=true;}
    });
    const routes=createAgentGatewayRoutes(mcp,config,{authorizeAction});
    const request={...identity,toolName:l2.name,arguments:{title:"test"},actionId,operation:"write"};
    await routes.tool(request);
    expect(mcp.call).toHaveBeenCalledWith(expect.objectContaining({toolName:l2.name,arguments:{title:"test",actionId}}));
    await expect(routes.tool(request)).rejects.toThrow("already_claimed");
    await expect(routes.tool({...request,ownerId:second})).rejects.toThrow("receipt_mismatch");
    expect(mcp.call).toHaveBeenCalledTimes(1);
    await routes.tool({...request,operation:"readback"});
    expect(mcp.call.mock.calls[1][0]).toEqual(expect.objectContaining({toolName:l2.readbackToolName,arguments:{title:"test",actionId}}));
    await expect(routes.tool({...request,arguments:{title:"test",actionId:"forged"}})).rejects.toThrow("spoofed");
  });
});
