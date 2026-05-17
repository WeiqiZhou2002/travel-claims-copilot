import { NextResponse } from "next/server";

import cases from "../../../data/cases.example.json";
import policies from "../../../data/policies.example.json";
import scripts from "../../../data/scripts.example.json";
import { buildAnalysisResult } from "../../../lib/analyze";
import type { Case, Policy, Script } from "../../../lib/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { description?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!description) {
    return NextResponse.json(
      { error: "Please provide a travel dispute description." },
      { status: 400 }
    );
  }

  const result = buildAnalysisResult(
    description,
    policies as Policy[],
    cases as Case[],
    scripts as Script[]
  );

  return NextResponse.json(result);
}
