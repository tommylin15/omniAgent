import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorizeApproval, authorizeContextEgress, type ApprovalRequest, type ContextEgress } from "../services/agent-gateway/agent_security.js";

describe("generic Agent security ownership", () => {
  it("keeps external domain definitions out of the generic contract", () => {
    const schema = JSON.parse(readFileSync("packages/contracts/agent.v1.json", "utf8"));
    expect(Object.keys(schema.definitions).sort()).toEqual(["AgentEventV1", "ApprovalRequestV1", "ContextEgressV1", "RuntimeBindingV1"]);
    expect(schema.definitions.ApprovalRequestV1.properties.operation.enum).toEqual(["shell", "write_file"]);
    expect(schema.definitions.ContextEgressV1.properties.sourceIds.uniqueItems).toBe(true);
  });

  it("requires selected sources, provider disclosure and private consent", () => {
    const request: ContextEgress = { ownerId: "owner", threadId: "thread", runtime: "codex", sourceIds: ["source"], containsPrivateData: true, providerDisclosed: true, privateDataConsent: true };
    expect(() => authorizeContextEgress(request)).not.toThrow();
    for (const changed of [
      { sourceIds: [] }, { sourceIds: ["source", "source"] }, { providerDisclosed: false },
      { privateDataConsent: false }, { ownerId: " " },
    ]) expect(() => authorizeContextEgress({ ...request, ...changed })).toThrow();
  });

  it("binds approvals to owner, turn, digest, scope and expiry", () => {
    const request: ApprovalRequest = { ownerId: "owner", threadId: "thread", turnId: "turn", requestId: "request", operation: "shell", scope: "turn_sandbox", paramsDigest: `sha256:${"a".repeat(64)}`, expiresAt: 100 };
    const decision = { ownerId: request.ownerId, threadId: request.threadId, turnId: request.turnId, requestId: request.requestId, paramsDigest: request.paramsDigest };
    expect(() => authorizeApproval(request, decision, 99)).not.toThrow();
    expect(() => authorizeApproval(request, { ...decision, ownerId: "other" }, 99)).toThrow();
    expect(() => authorizeApproval(request, { ...decision, paramsDigest: "sha256:wrong" }, 99)).toThrow();
    expect(() => authorizeApproval(request, decision, 100)).toThrow();
    expect(() => authorizeApproval({ ...request, scope: "elsewhere" as ApprovalRequest["scope"] }, decision, 99)).toThrow();
    expect(() => authorizeApproval({ ...request, operation: "place_order" as ApprovalRequest["operation"] }, decision, 99)).toThrow();
  });
});
