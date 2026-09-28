import seedCases from "../data/cases.json";
import published from "../data/reviewed-cases.json";
import type { ReviewState } from "./dp-review/types";
import type { Case } from "./types";

type ReviewedCaseRelease = {
  schemaVersion: 1;
  managedIds: string[];
  cases: Record<string, unknown>[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates the exported release of human-reviewed DPs. Only approved community reports with a
 * reviewed version may ship, and they must not collide with a seed case ID.
 */
export function parseReviewedCaseRelease(
  value: unknown,
  seedIds: readonly string[]
): ReviewedCaseRelease {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.cases) ||
    !Array.isArray(value.managedIds) ||
    new Set(value.managedIds).size !== value.managedIds.length ||
    value.managedIds.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,140}$/.test(id))
  ) {
    throw new Error("Invalid reviewed release manifest.");
  }
  const managedIds = value.managedIds as string[];
  value.cases.forEach((item) => {
    if (
      !isRecord(item) ||
      item.review_status !== "approved" ||
      item.source_type !== "community_dp" ||
      !Number.isInteger(item.reviewed_version) ||
      (item.reviewed_version as number) < 2 ||
      typeof item.case_id !== "string" ||
      !managedIds.includes(item.case_id)
    ) {
      throw new Error("Invalid reviewed publication.");
    }
  });
  if (seedIds.some((id) => managedIds.includes(id))) {
    throw new Error("A published DP conflicts with a seed case ID.");
  }
  return { schemaVersion: 1, managedIds, cases: value.cases as Record<string, unknown>[] };
}

/** Seed cases plus the reviewed release; the result is validated by the knowledge schema. */
export function buildCaseLibrary(seed: unknown, release: unknown): unknown[] {
  if (!Array.isArray(seed)) throw new Error("Seed cases must be an array.");
  const seedIds = seed.flatMap((item) =>
    isRecord(item) && typeof item.case_id === "string" ? [item.case_id] : []
  );
  const parsed = parseReviewedCaseRelease(release, seedIds);
  return [...seed, ...parsed.cases];
}

export function productionCaseLibraryRaw(): unknown[] {
  return buildCaseLibrary(structuredClone(seedCases), structuredClone(published));
}

export function mergeCaseLibrary(seed: Case[], state: ReviewState): Case[] {
  // A withdrawn managed DP must also suppress a legacy copy with the same stable ID.
  const managed = new Set(state.records.map((r) => r.id));
  return [
    ...seed.filter((c) => !managed.has(c.case_id)),
    ...state.records.flatMap((r) =>
      r.status === "approved" && r.publication?.review_status === "approved" ? [r.publication] : []
    )
  ];
}

/**
 * The only product read path for cases: bundled, versioned release data. Public traffic never
 * reads the local review workspace.
 */
export async function loadCaseLibrary(): Promise<Case[]> {
  return productionCaseLibraryRaw() as Case[];
}
