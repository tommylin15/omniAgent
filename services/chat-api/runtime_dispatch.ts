import {randomUUID} from "node:crypto";
import {validateEvents,type DispatchOutcome,type GatewayOperation} from "./gateway_dispatch.js";
import {ChatConflict,type ChatStore,type DispatchClaim,type RuntimeContext} from "./storage.js";

type Store=Pick<ChatStore,"saveRuntimeBinding"|"appendEvent"|"requestApproval"|"acquireRuntimeBinding"|"releaseRuntimeBinding"|"runtimeTurns"|"approvalDecision"|"unforwardedApprovals"|"markApprovalForwarded">;
type Rpc=(operation:GatewayOperation,value:Record<string,unknown>)=>Promise<unknown>;

export class NativeChatRuntime {
  constructor(private readonly store:Store,private readonly rpc:Rpc) {}

  async start(claim:DispatchClaim):Promise<DispatchOutcome> {
    const response=await this.rpc("turn:start",{...claim,messages:[{role:"user",content:claim.content}]});
    const binding=this.binding(response,claim);
    binding.cursor=-1;
    binding.operationId=randomUUID();
    await this.store.saveRuntimeBinding(binding);
    try { return await this.persist(response,claim,binding); }
    finally { await this.store.releaseRuntimeBinding(binding,binding.cursor); }
  }

  async refreshThread(ownerId:string,threadId:string):Promise<void> {
    for (const claim of await this.store.runtimeTurns(ownerId,threadId)) {
      const pending=await this.store.unforwardedApprovals(ownerId,threadId,claim.turnId);
      try {
        if (pending.length) await this.resolve(ownerId,threadId,claim.turnId,pending[0]);
        else await this.operation(claim.ownerId,claim.threadId,claim.turnId,"turn:events");
      } catch (error) {
        if (!(error instanceof ChatConflict) || error.message!=="runtime operation in progress") throw error;
      }
    }
  }

  async cancel(ownerId:string,threadId:string,turnId:string):Promise<DispatchOutcome> {
    return this.operation(ownerId,threadId,turnId,"turn:cancel");
  }

  async resolve(ownerId:string,threadId:string,turnId:string,requestId:string):Promise<DispatchOutcome> {
    const decision=await this.store.approvalDecision(ownerId,threadId,turnId,requestId);
    if (!["APPROVED","DENIED"].includes(String(decision.status)) ||
        new Date(String(decision.expires_at)).getTime()<=Date.now()) throw new ChatConflict("approval is not actionable");
    return this.operation(ownerId,threadId,turnId,"approval",{requestId,paramsDigest:decision.params_digest,
      decision:decision.status==="APPROVED"?"accept":"decline"});
  }

  private async operation(ownerId:string,threadId:string,turnId:string,operation:GatewayOperation,extra:Record<string,unknown>={}):Promise<DispatchOutcome> {
    let binding:RuntimeContext|null;
    try { binding=await this.store.acquireRuntimeBinding(ownerId,threadId,turnId); }
    catch (error) {
      if (operation!=="turn:events" && !(error instanceof ChatConflict && error.message==="runtime outcome needs reconciliation")) throw error;
      return this.fail(ownerId,threadId,turnId);
    }
    if (!binding) {
      if (operation!=="turn:events") throw new ChatConflict("runtime operation in progress");
      return {status:"running",turnId};
    }
    const claim={ownerId,threadId,turnId,runtime:"codex" as const,model:"",content:""};
    try {
      const {operationId,...payload}=binding;
      if (operation==="approval") await this.store.markApprovalForwarded(ownerId,threadId,turnId,String(extra.requestId));
      const response=await this.rpc(operation,{...payload,...extra});
      this.binding(response,claim,binding);
      return await this.persist(response,claim,binding);
    } catch {
      return this.fail(ownerId,threadId,turnId);
    } finally { await this.store.releaseRuntimeBinding(binding,binding.cursor); }
  }

  private binding(value:unknown,claim:DispatchClaim,expected?:RuntimeContext):RuntimeContext {
    if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error("invalid runtime binding");
    const row=value as Record<string,unknown>;
    const binding={} as RuntimeContext;
    for (const key of ["ownerId","threadId","turnId","turnHandle","nativeThreadId","nativeTurnId"] as const) {
      if (typeof row[key]!=="string" || !row[key] || row[key].length>128 ||
          (key in claim && row[key]!==claim[key as "ownerId"|"threadId"|"turnId"]) ||
          (expected && row[key]!==expected[key])) throw new Error("runtime binding mismatch");
      binding[key]=row[key];
    }
    if (!Number.isSafeInteger(row.cursor) || Number(row.cursor)<-1 ||
        (expected && Number(row.cursor)<expected.cursor)) throw new Error("invalid runtime cursor");
    binding.cursor=Number(row.cursor);
    return binding;
  }

  private async persist(value:unknown,claim:DispatchClaim,binding:RuntimeContext):Promise<DispatchOutcome> {
    const row=value as Record<string,unknown>;
    const events=validateEvents(row,claim,false);
    const raw=row.events as Record<string,unknown>[];
    let previous=binding.cursor;
    for (const event of raw) {
      if ((event.threadId!==undefined && event.threadId!==binding.nativeThreadId) ||
          (event.turnId!==undefined && event.turnId!==binding.nativeTurnId)) throw new Error("foreign native event binding");
      if (!Number.isSafeInteger(event.seq) || Number(event.seq)<=previous) throw new Error("invalid native sequence");
      previous=Number(event.seq);
    }
    if (row.cursor!==previous) throw new Error("native cursor does not match events");
    let cursor=binding.cursor;
    for (let index=0;index<events.length;index++) {
      const event=events[index];const seq=raw[index].seq;
      if (!Number.isSafeInteger(seq) || Number(seq)<0) throw new Error("invalid native sequence");
      // Replay is harmless: event IDs are tied to the durable turn and native sequence.
      if (event.type==="approval_request") {
        const p=event.payload as Record<string,unknown>;
        if (!["shell","write_file"].includes(String(p.operation)) || typeof p.requestId!=="string" ||
            typeof p.paramsDigest!=="string" || typeof p.expiresAt!=="string") throw new Error("invalid native approval");
        await this.store.requestApproval({ownerId:claim.ownerId,threadId:claim.threadId,turnId:claim.turnId,
          requestId:p.requestId,operation:p.operation as "shell"|"write_file",paramsDigest:p.paramsDigest,expiresAt:p.expiresAt});
      }
      await this.store.appendEvent(claim.ownerId,claim.threadId,claim.turnId,`native-${claim.turnId}-${seq}`,event.type,event.payload);
      cursor=Math.max(cursor,Number(seq));
    }
    binding.cursor=Math.max(cursor,Number(row.cursor));
    const last=events.at(-1)?.type;
    return {status:last==="turn_completed"?"completed":last==="turn_cancelled"?"cancelled":last==="turn_error"?"error":
      events.some(event=>event.type==="approval_request")?"awaiting_approval":"running",turnId:claim.turnId};
  }

  private async fail(ownerId:string,threadId:string,turnId:string):Promise<DispatchOutcome> {
    await this.store.appendEvent(ownerId,threadId,turnId,`runtime-${turnId}-uncertain`,"turn_error",{code:"runtime_outcome_uncertain"});
    return {status:"error",turnId,reason:"runtime_outcome_uncertain"};
  }
}
