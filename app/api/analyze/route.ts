import { NextResponse } from "next/server";

import { loadCaseLibrary } from "../../../lib/case-library";
import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
import { buildAnalysisFromFacts } from "../../../lib/analyze";
import { getMissingClaimFields, parseClaimFacts } from "../../../lib/claimFacts";
import {
  MAX_ANALYZE_DESCRIPTION_LENGTH,
  readBoundedJson
} from "../../../lib/inputLimits";
import { processIntake, IntakeError } from "../../../lib/intake";
import { acquireIntakeCapacity } from "../../../lib/intakeCapacity";
import { assessClaimSafety, assessHighRiskClaim } from "../../../lib/safety";
import type { Policy, Script } from "../../../lib/types";

export async function POST(request: Request) {
  const parsedBody = await readBoundedJson(request);
  if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
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
    return NextResponse.json(
      { error: safety.message, safety },
      { status: 422 }
    );
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
    const factSafety = assessClaimSafety(description, parsedFacts.data);
    if (factSafety) return NextResponse.json({ error: factSafety.message, safety: factSafety }, { status: 422 });
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
        await loadCaseLibrary(),
        scripts as Script[],
        description
      )
    );
  }

  if (!description) return NextResponse.json({error:"Please provide structured facts or describe your situation."},{status:400});
  const release = acquireIntakeCapacity();
  if (!release) return NextResponse.json({error:"Intake is busy. Please retry shortly."},{status:429,headers:{"Retry-After":"60"}});
  try {
    const intake = await processIntake(description);
    if (intake.status !== "ready") return NextResponse.json({error:intake.safety?.message ?? "More facts are needed.", ...intake},{status:422});
    return NextResponse.json(buildAnalysisFromFacts(intake.facts, policies as Policy[], await loadCaseLibrary(), scripts as Script[], description));
  } catch(error) {
    if(error instanceof IntakeError) return NextResponse.json({error:error.message,failureCategory:error.category},{status:error.status});
    console.error("Analysis request failed");
    return NextResponse.json({error:"分析暂时失败，请稍后重试。"},{status:503});
  } finally {release();}
}
