import {
  createIntakePostHandler,
  processClaimTurn,
  type ProcessClaimTurnDependencies
} from "../intake";
import { preflightGuard } from "../domain/safety-guard";
import { LocalRawFactExtractor } from "../model/raw-fact-extractor";
import {
  hasExactCanonicalResponseKeys,
  parseAnalyzeClaimRequest,
  parseAnalyzeRequest,
  parseExtractionMetadata,
  type ParsedAnalyzeRequest
} from "./analyze-contract";
import { isApiFault } from "./api-error";
import { INPUT_LIMITS } from "./input-limits";
import { isClaimStateReplayable, readJsonBody } from "./request-body";

export type IntakeRouteDependencies = Partial<ProcessClaimTurnDependencies> & {
  processRequest?: typeof processClaimTurn;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isCanonicalShape(body: Record<string, unknown>): boolean {
  return ["prior", "baseRevision", "correction", "requestedMode", "privacyAcknowledged"].some(
    (key) => hasOwn(body, key)
  );
}

function codePointLength(value: string): number {
  return [...value].length;
}

function legacyStringLimit(key: string, arrayItem: boolean): number {
  if (arrayItem) return INPUT_LIMITS.collectionItemCodePoints;
  if (key === "userGoal") return INPUT_LIMITS.userGoalCodePoints;
  return INPUT_LIMITS.ordinaryStringCodePoints;
}

function legacyFactsExceedLimits(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const pending: Array<{ key: string; candidate: unknown; arrayItem: boolean }> = Object.entries(
    value
  ).map(([key, candidate]) => ({ key, candidate, arrayItem: false }));
  while (pending.length > 0) {
    const { key, candidate, arrayItem } = pending.pop() as (typeof pending)[number];
    if (typeof candidate === "string") {
      const limit = legacyStringLimit(key, arrayItem);
      if (codePointLength(candidate) > limit) return true;
    } else if (Array.isArray(candidate)) {
      if (candidate.length > INPUT_LIMITS.collectionItems) return true;
      candidate.forEach((item) => pending.push({ key, candidate: item, arrayItem: true }));
    } else if (isRecord(candidate)) {
      Object.entries(candidate).forEach(([nestedKey, nestedCandidate]) =>
        pending.push({ key: nestedKey, candidate: nestedCandidate, arrayItem: false })
      );
    }
  }
  return false;
}

function legacyRequestExceedsLimits(body: Record<string, unknown>): boolean {
  return (
    (typeof body.message === "string" &&
      codePointLength(body.message) > INPUT_LIMITS.messageCodePoints) ||
    legacyFactsExceedLimits(body.facts)
  );
}

function safeReaderFailure(error: unknown): Response {
  if (!isApiFault(error)) {
    return Response.json({ error: "Intake processing failed." }, { status: 500 });
  }
  const messageByCode = {
    unsupported_media_type: "Request content type must be application/json.",
    invalid_json: "Invalid JSON request.",
    request_too_large: "Request body is too large.",
    unprocessable_request: "Invalid canonical intake request."
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

function replayJsonRequest(request: Request, body: unknown): Request {
  const replayBody = JSON.stringify(body, (_key, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("non_finite_number");
    }
    return value;
  });
  return new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: replayBody
  });
}

function claimDependencies(overrides: IntakeRouteDependencies): ProcessClaimTurnDependencies {
  return {
    localExtractor: overrides.localExtractor ?? new LocalRawFactExtractor(),
    ...(overrides.openaiExtractor ? { openaiExtractor: overrides.openaiExtractor } : {}),
    ...(overrides.knowledgeRepository
      ? { knowledgeRepository: overrides.knowledgeRepository }
      : {}),
    ...(overrides.now ? { now: overrides.now } : {})
  };
}

function canonicalIntakeResponse(response: Awaited<ReturnType<typeof processClaimTurn>>) {
  return {
    baseRevision: response.baseRevision,
    claimState: response.claimState,
    result: response.result,
    context: response.context
  };
}

export function createIntakeRouteHandler(overrides: IntakeRouteDependencies = {}) {
  return async function intakePost(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return safeReaderFailure(error);
    }

    if (!isRecord(body) || !isCanonicalShape(body)) {
      let replayedRequest: Request;
      try {
        if (isRecord(body) && legacyRequestExceedsLimits(body)) {
          return Response.json({ error: "Invalid legacy intake request." }, { status: 422 });
        }
        replayedRequest = replayJsonRequest(request, body);
      } catch {
        return Response.json({ error: "Invalid legacy intake request." }, { status: 422 });
      }
      const dependencies = claimDependencies(overrides);
      return createIntakePostHandler(dependencies)(replayedRequest);
    }

    const parsed = parseAnalyzeRequest(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid canonical intake request." }, { status: 422 });
    }
    const compatibleRequest = parseAnalyzeClaimRequest(body);
    if (!compatibleRequest.success) {
      return Response.json({ error: "Invalid canonical intake request." }, { status: 422 });
    }

    const dependencies = claimDependencies(overrides);
    try {
      const response = overrides.processRequest
        ? await overrides.processRequest(compatibleRequest.data, dependencies)
        : canonicalIntakeResponse(await processClaimTurn(compatibleRequest.data, dependencies));
      if (
        !hasExactCanonicalResponseKeys(response) ||
        !hasValidExtractionMetadata(response, parsed.data)
      ) {
        return Response.json({ error: "Intake processing failed." }, { status: 500 });
      }
      if (!isClaimStateReplayable(response.claimState)) {
        return Response.json(
          { error: "Intake processing failed." },
          { status: parsed.data.intent === "correction_only" ? 422 : 500 }
        );
      }
      return Response.json(response);
    } catch {
      return Response.json({ error: "Intake processing failed." }, { status: 500 });
    }
  };
}
