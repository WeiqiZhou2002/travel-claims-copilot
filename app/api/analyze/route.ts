import { NextResponse } from "next/server";

import cases from "../../../data/cases.json";
import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
import { buildAnalysisFromFacts, buildAnalysisResult } from "../../../lib/analyze";
import { createAnalyzeRouteHandler } from "../../../lib/api/analyze-route-handler";
import { toApiErrorResponse, withRequestId } from "../../../lib/api/api-response";
import { getMissingClaimFields, parseClaimFacts } from "../../../lib/claimFacts";
import { classifyInput } from "../../../lib/classifier";
import { MAX_ANALYZE_DESCRIPTION_LENGTH, requestBodyExceedsLimit } from "../../../lib/inputLimits";
import { isMvpIssueType, normalizeIssueType } from "../../../lib/issueTaxonomy";
import { assessHighRiskClaim } from "../../../lib/safety";
import type { Case, Policy, Script } from "../../../lib/types";

const canonicalAnalyzePost = createAnalyzeRouteHandler();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalAnalyzeBody(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    "message",
    "prior",
    "baseRevision",
    "correction",
    "requestedMode",
    "privacyAcknowledged"
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function withNoStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function legacyAnalyzePost(request: Request): Promise<Response> {
  if (requestBodyExceedsLimit(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as {
    caseId?: unknown;
    description?: unknown;
    issueType?: unknown;
    selectedIssueType?: unknown;
    facts?: unknown;
  } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const caseId = typeof body?.caseId === "string" ? body.caseId.trim() : "";
  const issueType = normalizeIssueType(body?.issueType ?? body?.selectedIssueType);
  const suppliedIssueSelector =
    isRecord(body) &&
    (Object.prototype.hasOwnProperty.call(body, "issueType") ||
      Object.prototype.hasOwnProperty.call(body, "selectedIssueType"));
  const selectedCase = caseId
    ? (cases as Case[]).find((item) => item.case_id === caseId)
    : undefined;
  const selectedCaseIssue = selectedCase ? normalizeIssueType(selectedCase.issue_type) : undefined;
  const describedIssue = description ? classifyInput(description).issueType : "unknown";

  if (
    (suppliedIssueSelector && (!issueType || !isMvpIssueType(issueType))) ||
    (selectedCase && (!selectedCaseIssue || !isMvpIssueType(selectedCaseIssue))) ||
    (describedIssue !== "unknown" && !isMvpIssueType(describedIssue))
  ) {
    return toApiErrorResponse("unprocessable_request", withRequestId());
  }

  if (description.length > MAX_ANALYZE_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      {
        error: `Description must be ${MAX_ANALYZE_DESCRIPTION_LENGTH} characters or fewer.`
      },
      { status: 413 }
    );
  }

  const safety = assessHighRiskClaim(description);
  if (safety) {
    return NextResponse.json({ error: safety.message, safety }, { status: 422 });
  }

  if (body?.facts !== undefined) {
    const parsedFacts = parseClaimFacts(body.facts);
    if (!parsedFacts.success) {
      return NextResponse.json(
        { error: "Invalid structured claim facts.", details: parsedFacts.errors },
        { status: 400 }
      );
    }

    const missingFields = getMissingClaimFields(parsedFacts.data);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "Structured claim facts are incomplete.",
          facts: parsedFacts.data,
          missingFields
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      buildAnalysisFromFacts(
        parsedFacts.data,
        policies as Policy[],
        cases as Case[],
        scripts as Script[],
        description
      )
    );
  }

  if (!description && !issueType && !caseId) {
    return NextResponse.json(
      { error: "Please provide a travel dispute description, issueType, or caseId." },
      { status: 400 }
    );
  }

  const result = await buildAnalysisResult(
    description,
    policies as Policy[],
    cases as Case[],
    scripts as Script[],
    { caseId: caseId || undefined, issueType }
  );

  return NextResponse.json(result);
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return withNoStore(await canonicalAnalyzePost(request));
  }

  const candidate = await request
    .clone()
    .json()
    .catch(() => null);
  if (isCanonicalAnalyzeBody(candidate)) {
    return withNoStore(await canonicalAnalyzePost(request));
  }

  return withNoStore(await legacyAnalyzePost(request));
}
