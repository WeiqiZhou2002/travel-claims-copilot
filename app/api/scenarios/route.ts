import { NextResponse } from "next/server";

import cases from "../../../data/cases.example.json";
import policies from "../../../data/policies.example.json";
import scripts from "../../../data/scripts.example.json";
import { buildScenarioSummaries } from "../../../lib/scenarios";
import type { Case, Policy, Script } from "../../../lib/types";

export async function GET() {
  const scenarios = buildScenarioSummaries(
    policies as Policy[],
    cases as Case[],
    scripts as Script[]
  );

  return NextResponse.json({ scenarios });
}
