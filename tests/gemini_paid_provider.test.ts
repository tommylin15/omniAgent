import {describe,it,expect,vi} from "vitest";
import {PaidGeminiProvider} from "../services/agent-gateway/gemini_paid_provider.js";
import {paidCost,PgPaidBudgetLedger} from "../services/agent-gateway/paid_budget.js";
import {createGeminiAgentPlanner} from "../services/agent-gateway/agent_planner.js";
const identity={project:"omniagent",ownerId:"11111111-1111-4111-8111-111111111111",
  requestId:"22222222-2222-4222-8222-222222222222",model:"gemini-2.5-flash",
  profile:"advanced-flash" as const,trustedClass:"private" as const,ownerModelAuthorized:true};
const env={GEMINI_PAID_ROUTING_ENABLED:"true",GEMINI_PAID_TIER_VERIFIED:"true",
  GEMINI_PAID_BILLING_EVIDENCE_REF:"evidence/test-only",GEMINI_PAID_MODELS_JSON:'["gemini-2.5-flash"]',
  OMNIAGENT_PROVIDER_BUNDLE:'{"gemini_paid_api_key":"paid-test-key"}'};
const usage={promptTokens:10,candidateTokens:4,totalTokens:18};
const answer={candidates:[{finishReason:"STOP",content:{parts:[{text:"answer"}]}}],
  usageMetadata:{promptTokenCount:10,candidatesTokenCount:4,thoughtsTokenCount:4,totalTokenCount:18}};
const model={name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"],inputTokenLimit:1000,outputTokenLimit:2048};
const ledger=()=>({reserve:vi.fn().mockResolvedValue(undefined),settle:vi.fn().mockResolvedValue({costMicros:2,priceVersion:"test-v1"})});
describe("paid Gemini fails closed without fallback or replay",()=>{
  it("requires explicit billing proof, configured model and bundle paid key",()=>{
    for(const patch of [{GEMINI_PAID_ROUTING_ENABLED:"false"},{GEMINI_PAID_BILLING_EVIDENCE_REF:""},
      {OMNIAGENT_PROVIDER_BUNDLE:'{"gemini_api_key":"free-key"}'}])
      expect(()=>PaidGeminiProvider.fromEnvironment({...env,...patch},ledger())).toThrow();
  });
  it("reads key-specific availability before reserving and bills real total including thoughts",async()=>{
    const l=ledger();const fetcher=vi.fn().mockResolvedValueOnce(Response.json(model)).mockResolvedValueOnce(Response.json({totalTokens:10})).mockResolvedValueOnce(Response.json(answer));
    const p=PaidGeminiProvider.fromEnvironment(env,l,fetcher);
    expect((await p.generate({...identity,prompt:"hello",maxOutputTokens:512})).usage).toEqual(usage);
    expect(l.reserve).toHaveBeenCalledWith(expect.objectContaining({inputCeiling:10,outputCeiling:512}));
    expect(l.settle).toHaveBeenCalledWith(expect.objectContaining({requestId:identity.requestId}),usage);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][1].headers["x-goog-api-key"]).toBe("paid-test-key");
  });
  it("rejects unverified availability without invoking generation",async()=>{
    const l=ledger();const f=vi.fn().mockResolvedValue(Response.json({...model,supportedGenerationMethods:[]}));
    await expect(PaidGeminiProvider.fromEnvironment(env,l,f).generate({...identity,prompt:"x",maxOutputTokens:10})).rejects.toThrow("unavailable");
    expect(l.reserve).not.toHaveBeenCalled();expect(f).toHaveBeenCalledTimes(1);
  });
  it("keeps ambiguous and missing usage reservations without retry",async()=>{
    for(const response of [new Response("",{status:429}),Response.json({...answer,usageMetadata:{}})]){
      const l=ledger();const f=vi.fn().mockResolvedValueOnce(Response.json(model)).mockResolvedValueOnce(Response.json({totalTokens:10})).mockResolvedValueOnce(response);
      await expect(PaidGeminiProvider.fromEnvironment(env,l,f).generate({...identity,prompt:"x",maxOutputTokens:10})).rejects.toThrow();
      expect(l.reserve).toHaveBeenCalledOnce();expect(l.settle).not.toHaveBeenCalled();expect(f).toHaveBeenCalledTimes(3);
    }
  });
});
describe("versioned budget costs",()=>{
  const price={model:identity.model,version:"test-not-a-published-price",source:"https://ai.google.dev/gemini-api/docs/pricing",
    validUntil:"2099-01-01T00:00:00Z",inputMicrousdPerMillion:1000000,outputMicrousdPerMillion:2000000};
  it("rounds up integer microdollars and refuses unknown price",()=>{
    expect(paidCost(price,2,3)).toBe(8);
    expect(()=>paidCost({...price,validUntil:"UNKNOWN"},2,3)).toThrow();
    expect(()=>paidCost({...price,inputMicrousdPerMillion:0},2,3)).toThrow();
  });
  it("serializes reserve, rejects duplicate intent, rolls back and releases connection",async()=>{
    const query=vi.fn().mockResolvedValue({rowCount:1,rows:[]});const release=vi.fn();
    const pool={connect:vi.fn().mockResolvedValue({query,release})};
    const cap={calls:10,tokens:10000,microusd:10000};
    const l=new PgPaidBudgetLedger(pool as never,{ownerDay:cap,ownerMonth:cap,projectDay:cap,projectMonth:cap},new Map([[identity.model,price]]));
    await expect(l.reserve({...identity,inputCeiling:100,outputCeiling:10})).rejects.toThrow("no_replay");
    expect(query.mock.calls[1][0]).toContain("pg_advisory_xact_lock");expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");expect(release).toHaveBeenCalledOnce();
  });
});
describe("Gemini function planner",()=>{
  const tool={name:"calendar.read",description:"read calendar",parameters:{type:"object",properties:{}},validate:(v:Record<string,unknown>)=>Object.keys(v).length===0};
  const result=(parts:unknown[])=>({body:{candidates:[{finishReason:"STOP",content:{parts}}]},usage,model:identity.model,costMicros:2,priceVersion:"test"});
  it("offers only granted schemas with safe aliases and records cost",async()=>{
    const generate=vi.fn().mockResolvedValue(result([{functionCall:{name:"tool_0",args:{}}}]));const onUsage=vi.fn();
    const planner=createGeminiAgentPlanner({generate,tools:[tool],grants:new Set([tool.name]),onUsage});
    expect(await planner({question:"hi",observations:[],stepsRemaining:2,toolsRemaining:2},new AbortController().signal)).toEqual({kind:"tool",name:tool.name,arguments:{}});
    expect(onUsage).toHaveBeenCalledWith(usage,{costMicros:2,priceVersion:"test"});
    expect(generate.mock.calls[0][0].tools[0].functionDeclarations[0].name).toBe("tool_0");
  });
  it("rejects multiple calls and unknown tool arguments",async()=>{
    for(const parts of [[{functionCall:{name:"tool_0",args:{x:1}}}],
      [{functionCall:{name:"tool_0",args:{}}},{functionCall:{name:"tool_0",args:{}}}]]){
      const planner=createGeminiAgentPlanner({generate:async()=>result(parts),tools:[tool],grants:new Set([tool.name])});
      await expect(planner({question:"hi",observations:[],stepsRemaining:2,toolsRemaining:2},new AbortController().signal)).rejects.toThrow();
    }
  });
});
