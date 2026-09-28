import { NextResponse } from "next/server";

import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
import { productionCaseLibraryRaw } from "../../../lib/case-library";
import { buildAnalysisFromFacts } from "../../../lib/analyze";
import { createAnalyzeRouteHandler } from "../../../lib/api/analyze-route-handler";
import { getMissingClaimFields, parseClaimFacts } from "../../../lib/claimFacts";
import { MAX_ANALYZE_DESCRIPTION_LENGTH, readBoundedJson } from "../../../lib/inputLimits";
import { IntakeError, processIntake } from "../../../lib/intake";
import { acquireIntakeCapacity } from "../../../lib/intakeCapacity";
import { assessClaimSafety, assessHighRiskClaim } from "../../../lib/safety";
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

function analysisFromFacts(
  facts: Parameters<typeof buildAnalysisFromFacts>[0],
  description: string
) {
  return buildAnalysisFromFacts(
    facts,
    policies as Policy[],
    productionCaseLibraryRaw() as Case[],
    scripts as Script[],
    description
  );
}

async function legacyAnalyzePost(request: Request): Promise<Response> {
  const parsedBody = await readBoundedJson(request);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
  }
  const body = parsedBody.value;
  const description = typeof body?.description === "string" ? body.description.trim() : "";

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

    const factSafety = assessClaimSafety(description, parsedFacts.data);
    if (factSafety) {
      return NextResponse.json({ error: factSafety.message, safety: factSafety }, { status: 422 });
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

    return NextResponse.json(analysisFromFacts(parsedFacts.data, description));
  }

  if (!description) {
    return NextResponse.json(
      { error: "Please provide structured facts or describe your situation." },
      { status: 400 }
    );
  }

  // A free-text description goes through the same LLM intake; there is no rule-based fallback.
  const release = acquireIntakeCapacity();
  if (!release) {
    return NextResponse.json(
      { error: "Intake is busy. Please retry shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  try {
    const intake = await processIntake(description);
    if (intake.status !== "ready") {
      return NextResponse.json(
        { error: intake.safety?.message ?? "More facts are needed.", ...intake },
        { status: 422 }
      );
    }
    return NextResponse.json(analysisFromFacts(intake.facts, description));
  } catch (error) {
    if (error instanceof IntakeError) {
      return NextResponse.json(
        { error: error.message, failureCategory: error.category },
        { status: error.status }
      );
    }
    return NextResponse.json({ error: "分析暂时失败，请稍后重试。" }, { status: 503 });
  } finally {
    release();
  }
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
