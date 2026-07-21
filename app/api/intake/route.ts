import { NextResponse } from "next/server";

import { createIntakeRouteHandler } from "../../../lib/api/intake-route-handler";
import { emptyClaimFacts, parseClaimFacts } from "../../../lib/claimFacts";
import { MAX_INTAKE_MESSAGE_LENGTH, requestBodyExceedsLimit } from "../../../lib/inputLimits";
import { processIntake } from "../../../lib/intake";

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
  if (requestBodyExceedsLimit(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    facts?: unknown;
  } | null;
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

  return NextResponse.json(await processIntake(message, currentFacts));
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
