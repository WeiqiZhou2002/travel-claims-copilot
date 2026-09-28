import seedCases from "../data/cases.json";
import type { Case } from "./types";
import { getReviewRepository } from "./dp-review/file-repository";
import type { ReviewState } from "./dp-review/types";

export function mergeCaseLibrary(seed: Case[], state: ReviewState):Case[] {
  // A withdrawn managed DP must also suppress a legacy copy with the same stable ID.
  const managed=new Set(state.records.map(r=>r.id));
  return [...seed.filter(c=>!managed.has(c.case_id)), ...state.records.flatMap(r=>r.status==="approved" && r.publication?.review_status==="approved"?[r.publication]:[])];
}
export async function loadCaseLibrary():Promise<Case[]> {
  return mergeCaseLibrary(seedCases as Case[],await getReviewRepository().read());
}
