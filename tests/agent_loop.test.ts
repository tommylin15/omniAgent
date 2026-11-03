import {describe,expect,it,vi} from "vitest";
import {runBoundedAgentLoop,type AgentTool} from "../services/agent-gateway/agent_loop.js";

const owner="00000000-0000-4000-8000-000000000001";
const limits={maxSteps:4,maxToolCalls:2,timeoutMs:10000,maxToolOutputBytes:1024};
const read:AgentTool={name:"life.activities.search",readOnly:true,
  validate:(args)=>typeof args.keyword==="string",
  call:vi.fn(async()=>({events:[{name:"活動 A",start_date:"2026-11-07"}]}))};
const request=(grants=new Set(["life.activities.search"]))=>
  ({ownerId:owner,question:"週末活動？",grants,limits});

describe("bounded Agent Loop is isolated from production and write tools",()=>{
  it("resumes counters and observations without resetting limits",async()=>{
    const planner=vi.fn(async()=>({kind:"final" as const,text:"done"}));
    const result=await runBoundedAgentLoop({...request(),initialState:{steps:4,toolCalls:1,
      observations:[{origin:"untrusted_tool_result",name:read.name,result:{events:[]}}]}},
      planner,new Map([[read.name,read]]));
    expect(result).toMatchObject({status:"limit_exceeded",steps:4,toolCalls:1});
    expect(planner).not.toHaveBeenCalled();
  });
  it("rejects throwing validators before calling the tool",async()=>{
    const call=vi.fn();
    const result=await runBoundedAgentLoop(request(),async()=>({kind:"tool",name:read.name,
      arguments:{keyword:"a"}}),new Map([[read.name,{...read,call,validate:()=>{throw new Error("bad schema");}}]]));
    expect(result).toMatchObject({status:"denied",reason:"invalid_tool_arguments"});
    expect(call).not.toHaveBeenCalled();
  });
  it("performs model decision -> granted readonly tool -> observation -> final",async()=>{
    const planner=vi.fn().mockResolvedValueOnce({
      kind:"tool",name:"life.activities.search",arguments:{keyword:"音樂"}
    }).mockResolvedValueOnce({kind:"final",text:"已查到活動 A"});
    const result=await runBoundedAgentLoop(request(),planner,new Map([[read.name,read]]));
    expect(result).toMatchObject({status:"completed",text:"已查到活動 A",
      steps:2,toolCalls:1});
    expect(result.observations).toEqual([expect.objectContaining({
      origin:"untrusted_tool_result",name:"life.activities.search"
    })]);
    expect(planner.mock.calls[1][0].observations).toHaveLength(1);
  });
  it("does not invoke an ungranted tool",async()=>{
    const invoke=vi.fn();
    const tool={...read,call:invoke};
    const result=await runBoundedAgentLoop(request(new Set()),async()=>({
      kind:"tool",name:read.name,arguments:{keyword:"秘密"}
    }),new Map([[read.name,tool]]));
    expect(result).toMatchObject({status:"denied",reason:"tool_not_granted",toolCalls:0});
    expect(invoke).not.toHaveBeenCalled();
  });
  it("refuses destructive tools even if granted",async()=>{
    const invoke=vi.fn();
    const result=await runBoundedAgentLoop(request(new Set(["life.activities.search"])),
      async()=>({kind:"tool",name:"life.activities.search",arguments:{keyword:"a"}}),
      new Map([[read.name,{...read,readOnly:false as true,call:invoke}]]));
    expect(result.reason).toBe("tool_unavailable_or_not_read_only");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("rejects invalid input and outputs without retry",async()=>{
    const invoke=vi.fn();
    const result=await runBoundedAgentLoop(request(),async()=>({
      kind:"tool",name:read.name,arguments:{invalid:"foo"}
    }),new Map([[read.name,{...read,call:invoke}]]));
    expect(result.reason).toBe("invalid_tool_arguments");
    expect(invoke).not.toHaveBeenCalled();
    const large=await runBoundedAgentLoop(request(),async()=>({
      kind:"tool",name:read.name,arguments:{keyword:"x"}
    }),new Map([[read.name,{...read,call:async()=>({huge:"x".repeat(2000)})}]]));
    expect(large.reason).toBe("tool_result_invalid_or_oversize");
  });
  it("enforces hard timeout when planner ignores AbortSignal",async()=>{
    const r=await runBoundedAgentLoop({...request(),limits:{...limits,timeoutMs:100}},
      async()=>new Promise<never>(()=>{}),new Map());
    expect(r).toMatchObject({status:"limit_exceeded",reason:"timeout"});
  });
  it("stops at step budget and honors pre-cancel",async()=>{
    const unfinished=await runBoundedAgentLoop(
      {...request(),limits:{...limits,maxSteps:1}},async()=>({
        kind:"tool",name:read.name,arguments:{keyword:"a"}
      }),new Map([[read.name,read]]));
    expect(unfinished).toMatchObject({status:"limit_exceeded",reason:"decision_step_limit"});
    const controller=new AbortController();controller.abort();
    const planner=vi.fn();
    const cancelled=await runBoundedAgentLoop({...request(),signal:controller.signal},
      planner,new Map([[read.name,read]]));
    expect(cancelled).toMatchObject({status:"cancelled",reason:"signal_aborted"});
    expect(planner).not.toHaveBeenCalled();
  });
});
