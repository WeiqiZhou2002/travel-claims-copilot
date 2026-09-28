import { NextResponse } from "next/server";

import { createIntakeRouteHandler } from "../../../lib/api/intake-route-handler";
import { emptyClaimFacts, parseClaimFacts } from "../../../lib/claimFacts";
import { MAX_INTAKE_MESSAGE_LENGTH, readBoundedJson } from "../../../lib/inputLimits";
import { IntakeError, processIntake } from "../../../lib/intake";
import { acquireIntakeCapacity } from "../../../lib/intakeCapacity";

const canonicalIntakePost = createIntakeRouteHandler();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalIntakeBody(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["prior", "baseRevision", "correction", "requestedMode", "privacyAcknowledged"].some(
    (key) => Object.prototype.hasOwnProperty.call(value, key)
  );
}

function withNoStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function legacyIntakePost(request: Request): Promise<Response> {
  const parsedBody = await readBoundedJson(request);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
  }
  const body = parsedBody.value;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Please provide a message." }, { status: 400 });
  }
  if (message.length > MAX_INTAKE_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message must be ${MAX_INTAKE_MESSAGE_LENGTH} characters or fewer.` },
      { status: 413 }
    );
  }

  let currentFacts = emptyClaimFacts();
  if (body?.facts !== undefined && body.facts !== null) {
    const parsed = parseClaimFacts(body.facts);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid existing claim facts.", details: parsed.errors },
        { status: 400 }
      );
    }
    currentFacts = parsed.data;
  }

  const release = acquireIntakeCapacity();
  if (!release) {
    return NextResponse.json(
      { error: "Intake is busy. Please retry shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  try {
    return NextResponse.json(await processIntake(message, currentFacts));
  } catch (error) {
    if (error instanceof IntakeError) {
      return NextResponse.json(
        { error: error.message, failureCategory: error.category },
        { status: error.status }
      );
    }
    return NextResponse.json({ error: "事实抽取失败，请稍后重试。" }, { status: 503 });
  } finally {
    release();
  }
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return withNoStore(await canonicalIntakePost(request));
  }

  const candidate = await request
    .clone()
    .json()
    .catch(() => null);
  if (isCanonicalIntakeBody(candidate)) {
    return withNoStore(await canonicalIntakePost(request));
  }

  return withNoStore(await legacyIntakePost(request));
}
