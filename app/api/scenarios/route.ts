import { NextResponse } from "next/server";

import { loadCaseLibrary } from "../../../lib/case-library";
import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
import { buildScenarioSummaries } from "../../../lib/scenarios";
import type { Policy, Script } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const scenarios = buildScenarioSummaries(
    policies as Policy[],
    await loadCaseLibrary(),
    scripts as Script[]
  );

  return NextResponse.json({ scenarios });
}
