import seedCases from "../data/cases.json";
import type { Case } from "./types";
import published from "../data/reviewed-cases.json";
import type { ReviewState } from "./dp-review/types";

export function mergeCaseLibrary(seed: Case[], state: ReviewState):Case[] {
  // A withdrawn managed DP must also suppress a legacy copy with the same stable ID.
  const managed=new Set(state.records.map(r=>r.id));
  return [...seed.filter(c=>!managed.has(c.case_id)), ...state.records.flatMap(r=>r.status==="approved" && r.publication?.review_status==="approved"?[r.publication]:[])];
}
export async function loadCaseLibrary():Promise<Case[]> {
  // Bundled, versioned release data only. Public traffic never reads the review workspace.
  return [...(seedCases as Case[]).filter(item => !(published.managedIds as string[]).includes(item.case_id)), ...(published.cases as Case[])];
}
