import {describe,it,expect,vi} from "vitest";
import {agentActionDigest,executeAgentRun,type RuntimeTool} from "../services/agent-worker/runtime.js";
import {validateAgentPolicy,type AgentRun,type PgAgentRunStore} from "../services/chat-api/agent_runs.js";
const owner="00000000-0000-4000-8000-000000000001",id="00000000-0000-4000-8000-000000000002";
function fixture(){
 const run:AgentRun={owner_id:owner,run_id:id,thread_id:"thread",turn_id:"turn",question:"Find events",
  policy:{limits:{maxSteps:4,maxToolCalls:2,timeoutMs:10000,maxToolOutputBytes:1024},maxTokens:1000,
   maxCostMicros:1000,maxDecisionTokens:100,maxDecisionCostMicros:100,grants:["life.read"],allowL2:false},
  status:"running",fence:1,created_at:new Date(),result:null,
  checkpoint:{steps:0,toolCalls:0,observations:[],phase:"ready",tokens:0,costMicros:0}};
 const store={claim:vi.fn(async()=>run),heartbeat:vi.fn(),checkpoint:vi.fn(),finish:vi.fn(),
  emit:vi.fn(),proposeAction:vi.fn(async()=>({status:"approved"})),
  beginAction:vi.fn(),actionResult:vi.fn()} as unknown as PgAgentRunStore;
 const call=vi.fn(async()=>({events:["concert"]}));
 const tool:RuntimeTool={name:"life.search",description:"events",grant:"life.read",risk:"L0",
  inputSchema:{type:"object",properties:{keyword:{type:"string"}},required:["keyword"],additionalProperties:false},call};
 const gateway=vi.fn().mockResolvedValueOnce({decision:{kind:"tool",name:tool.name,arguments:{keyword:"music"}},
  usage:{tokens:10,costMicros:10}}).mockResolvedValue({decision:{kind:"final",text:"Concert"},usage:{tokens:10,costMicros:10}});
 return {run,store,call,tool,gateway,deps:{store,gateway,tools:async()=>[tool]}};
}
describe("durable bounded agent runtime",()=>{
 it("persists pending effects before executing and records observations",async()=>{
  const f=fixture();const result=await executeAgentRun(f.deps,owner,id);
  expect(result).toMatchObject({status:"completed",steps:2,toolCalls:1});
  expect(f.call).toHaveBeenCalledOnce();
  const checkpoints=vi.mocked(f.store.checkpoint).mock.calls.map(c=>c[1]);
  expect(checkpoints.some(c=>c.phase==="tool")).toBe(true);
  expect(checkpoints.some(c=>c.phase==="ready"&&c.observations.length===1)).toBe(true);
  expect(checkpoints.at(-1)).toMatchObject({tokens:20,costMicros:20});
 });
 it("validates discovered JSON schema before a remote call",async()=>{
  const f=fixture();f.gateway.mockReset().mockResolvedValue({decision:{kind:"tool",name:f.tool.name,
   arguments:{keyword:10}},usage:{tokens:10,costMicros:10}});
  expect(await executeAgentRun(f.deps,owner,id)).toMatchObject({status:"tool_error"});
  expect(f.call).not.toHaveBeenCalled();
 });
 it("fails closed on missing provider usage and never repeats the decision",async()=>{
  const f=fixture();f.gateway.mockReset().mockResolvedValue({decision:{kind:"final",text:"answer"}});
  await executeAgentRun(f.deps,owner,id);
  expect(f.gateway).toHaveBeenCalledOnce();expect(f.call).not.toHaveBeenCalled();
  expect(f.store.finish).toHaveBeenCalledWith(f.run,"blocked",expect.anything());
 });
 it("reserves the per-decision maximum before calling the model",async()=>{
  const f=fixture();f.run.checkpoint.tokens=950;
  await executeAgentRun(f.deps,owner,id);expect(f.gateway).not.toHaveBeenCalled();
 });
 it("does not invoke a tool without its backend grant",async()=>{
  const f=fixture();f.run.policy.grants=[];
  expect(await executeAgentRun(f.deps,owner,id)).toMatchObject({status:"denied",reason:"tool_not_granted"});
  expect(f.call).not.toHaveBeenCalled();
 });
 it("requires L2 approval and readback before reporting success",async()=>{
  const f=fixture();f.run.policy.allowL2=true;f.tool.risk="L2";
  const digest=agentActionDigest(id,f.tool.name,{keyword:"music"});
  const actionId=`${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;
  f.gateway.mockReset().mockResolvedValueOnce({decision:{kind:"tool",name:f.tool.name,
   arguments:{keyword:"music"}},usage:{tokens:10,costMicros:10}})
   .mockResolvedValue({decision:{kind:"final",text:"created"},usage:{tokens:10,costMicros:10}});
  f.tool.readback=vi.fn(async()=>({id:"event"}));f.tool.confirms=()=>true;
  await executeAgentRun(f.deps,owner,id);
  expect(f.store.beginAction).toHaveBeenCalledWith(f.run,actionId,
   agentActionDigest(id,f.tool.name,{keyword:"music"}));
  expect(f.store.actionResult).toHaveBeenCalledWith(f.run,actionId,"confirmed",{id:"event"});
 });
 it("records unknown mutation outcome and stops on failed readback",async()=>{
  const f=fixture();f.run.policy.allowL2=true;f.tool.risk="L2";
  f.tool.readback=vi.fn(async()=>{throw new Error("network failed");});f.tool.confirms=()=>true;
  f.gateway.mockReset().mockResolvedValue({decision:{kind:"tool",name:f.tool.name,
   arguments:{keyword:"music"}},usage:{tokens:10,costMicros:10}});
  await executeAgentRun(f.deps,owner,id);
  expect(f.call).toHaveBeenCalledOnce();expect(f.gateway).toHaveBeenCalledOnce();
  expect(f.store.actionResult).toHaveBeenCalledWith(f.run,expect.any(String),"unknown",expect.anything());
 });
 it("persists an exact pending decision and never writes before approval",async()=>{
  const f=fixture();f.run.policy.allowL2=true;f.tool.risk="L2";
  f.tool.readback=vi.fn();f.tool.confirms=()=>true;
  vi.mocked(f.store.proposeAction).mockResolvedValue({status:"pending"});
  await executeAgentRun(f.deps,owner,id);
  expect(f.call).not.toHaveBeenCalled();expect(f.store.beginAction).not.toHaveBeenCalled();
  expect(f.store.emit).toHaveBeenCalledWith(f.run,"approval_request",expect.objectContaining({
   paramsDigest:agentActionDigest(id,f.tool.name,{keyword:"music"})}));
  expect(vi.mocked(f.store.checkpoint).mock.calls.some(c=>c[1].pendingDecision?.kind==="tool")).toBe(true);
 });
 it("resumes the approved decision with identical input without another model call",async()=>{
  const f=fixture();f.run.checkpoint.pendingDecision={kind:"tool",name:f.tool.name,arguments:{keyword:"approved"}};
  f.run.checkpoint.steps=1;
  f.gateway.mockReset().mockResolvedValue({decision:{kind:"final",text:"done"},usage:{tokens:1,costMicros:1}});
  await executeAgentRun(f.deps,owner,id);
  expect(f.call).toHaveBeenCalledWith({keyword:"approved"},expect.anything(),expect.anything());
  expect(f.gateway).toHaveBeenCalledOnce();
 });
 it("does not reset elapsed wall time when resumed",async()=>{
  const f=fixture();f.run.created_at=new Date(Date.now()-20000);
  await executeAgentRun(f.deps,owner,id);expect(f.gateway).not.toHaveBeenCalled();
  expect(f.store.finish).toHaveBeenCalledWith(f.run,"blocked",expect.anything());
 });
 it("blocks stale lease before calling the model",async()=>{
  const f=fixture();vi.mocked(f.store.checkpoint).mockRejectedValue(new Error("agent_lease_lost"));
  await executeAgentRun(f.deps,owner,id);expect(f.gateway).not.toHaveBeenCalled();
 });
 it("binds approval digest to run, tool and canonical arguments",()=>{
  expect(agentActionDigest(id,"calendar.create",{a:1,b:2})).toBe(agentActionDigest(id,"calendar.create",{b:2,a:1}));
  expect(agentActionDigest(id,"calendar.create",{a:1})).not.toBe(agentActionDigest(owner,"calendar.create",{a:1}));
 });
 it("rejects unbounded policy values",()=>{
  const f=fixture();f.run.policy.maxTokens=Infinity;
  expect(()=>validateAgentPolicy(f.run.policy)).toThrow("invalid_agent_policy");
 });
});
