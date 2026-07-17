import { NextResponse } from "next/server";

import cases from "../../../data/cases.json";
import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
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
