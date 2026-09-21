export type ContextEgress = {
  ownerId: string;
  threadId: string;
  runtime: "openrouter" | "gemini" | "codex";
  sourceIds: string[];
  containsPrivateData: boolean;
  providerDisclosed: boolean;
  privateDataConsent: boolean;
};

export function authorizeContextEgress(request: ContextEgress): void {
  if (!request.ownerId.trim() || !request.threadId.trim() || !request.sourceIds.length ||
      request.sourceIds.some((source) => !source.trim()) || new Set(request.sourceIds).size !== request.sourceIds.length) {
    throw new Error("owner, thread, and unique selected sources are required");
  }
  if (!request.providerDisclosed || (request.containsPrivateData && !request.privateDataConsent)) {
    throw new Error("provider disclosure and private-data consent are required");
  }
}

export type ApprovalRequest = {
  ownerId: string;
  threadId: string;
  turnId: string;
  requestId: string;
  paramsDigest: string;
  operation: "shell" | "write_file";
  scope: "turn_sandbox";
  expiresAt: number;
};

export function authorizeApproval(
  request: ApprovalRequest,
  decision: Pick<ApprovalRequest, "ownerId" | "threadId" | "turnId" | "requestId" | "paramsDigest">,
  now = Date.now(),
): void {
  if (request.ownerId !== decision.ownerId || request.threadId !== decision.threadId ||
      request.turnId !== decision.turnId || request.requestId !== decision.requestId ||
      request.paramsDigest !== decision.paramsDigest) throw new Error("approval binding mismatch");
  if ((request.operation !== "shell" && request.operation !== "write_file") || request.scope !== "turn_sandbox" ||
      !/^sha256:[0-9a-f]{64}$/.test(request.paramsDigest)) throw new Error("approval scope or digest is invalid");
  if (now >= request.expiresAt) throw new Error("approval expired");
}
