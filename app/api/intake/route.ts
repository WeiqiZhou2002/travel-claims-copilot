import { NextResponse } from "next/server";

import { emptyClaimFacts, parseClaimFacts } from "../../../lib/claimFacts";
import {
  MAX_INTAKE_MESSAGE_LENGTH,
  readBoundedJson
} from "../../../lib/inputLimits";
import { processIntake } from "../../../lib/intake";
import { acquireIntakeCapacity } from "../../../lib/intakeCapacity";

export async function POST(request: Request) {
  const parsedBody = await readBoundedJson(request);
  if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
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
  if (!release) return NextResponse.json({ error: "Intake is busy. Please retry shortly." },
    { status: 429, headers: { "Retry-After": "60" } });
  try {
    return NextResponse.json(await processIntake(message, currentFacts));
  } finally { release(); }
}
