import { processClaimTurn, type ProcessClaimDependencies } from "../claim-workflow";
import { createKnowledgeRepository } from "../knowledge/knowledge-repository";
import { LocalRawFactExtractor } from "../model/raw-fact-extractor";
import { preflightGuard } from "../domain/safety-guard";
import {
  hasExactCanonicalResponseKeys,
  parseAnalyzeClaimRequest,
  parseAnalyzeRequest,
  parseExtractionMetadata,
  type ParsedAnalyzeRequest
} from "./analyze-contract";
import { isApiFault } from "./api-error";
import { isClaimStateReplayable, readJsonBody } from "./request-body";

export type AnalyzeRouteDependencies = Partial<ProcessClaimDependencies> & {
  processRequest?: typeof processClaimTurn;
};

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeReaderFailure(error: unknown): Response {
  if (!isApiFault(error)) {
    return Response.json({ error: "Analyze processing failed." }, { status: 500 });
  }
  const messageByCode = {
    unsupported_media_type: "Request content type must be application/json.",
    invalid_json: "Invalid JSON request.",
    request_too_large: "Request body is too large.",
    unprocessable_request: "Invalid canonical analyze request."
  } as const;
  return Response.json({ error: messageByCode[error.code] }, { status: error.status });
}

function hasValidExtractionMetadata(value: unknown, request: ParsedAnalyzeRequest): boolean {
  if (!isRecord(value) || !isRecord(value.result)) return false;
  const parsed = parseExtractionMetadata(value.result.extraction);
  if (!parsed.success || parsed.data.requestedMode !== (request.requestedMode ?? "local")) {
    return false;
  }
  if (request.intent === "correction_only") {
    return parsed.data.performed === false && parsed.data.notRunReason === "correction_only";
  }
  if (preflightGuard(request.message).status !== "pass") {
    return parsed.data.performed === false && parsed.data.notRunReason === "preflight_guard";
  }
  return parsed.data.performed === true;
}

export function createAnalyzeRouteHandler(overrides: AnalyzeRouteDependencies = {}) {
  return async function analyzePost(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return safeReaderFailure(error);
    }

    const parsed = parseAnalyzeRequest(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid canonical analyze request." }, { status: 422 });
    }
    const compatibleRequest = parseAnalyzeClaimRequest(body);
    if (!compatibleRequest.success) {
      return Response.json({ error: "Invalid canonical analyze request." }, { status: 422 });
    }

    const asOf = overrides.now?.() ?? currentUtcDate();
    const dependencies: ProcessClaimDependencies = {
      localExtractor: overrides.localExtractor ?? new LocalRawFactExtractor(),
      ...(overrides.openaiExtractor ? { openaiExtractor: overrides.openaiExtractor } : {}),
      knowledgeRepository: overrides.knowledgeRepository ?? createKnowledgeRepository({ asOf }),
      now: () => asOf,
      ...(overrides.retrievalLimits ? { retrievalLimits: overrides.retrievalLimits } : {})
    };
    try {
      const processRequest = overrides.processRequest ?? processClaimTurn;
      const response = await processRequest(compatibleRequest.data, dependencies);
      if (
        !hasExactCanonicalResponseKeys(response) ||
        !hasValidExtractionMetadata(response, parsed.data)
      ) {
        return Response.json({ error: "Analyze processing failed." }, { status: 500 });
      }
      if (!isClaimStateReplayable(response.claimState)) {
        return Response.json(
          { error: "Analyze processing failed." },
          { status: parsed.data.intent === "correction_only" ? 422 : 500 }
        );
      }
      return Response.json(response);
    } catch {
      return Response.json({ error: "Analyze processing failed." }, { status: 500 });
    }
  };
}
