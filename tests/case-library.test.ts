import { describe, expect, it } from "vitest";

import published from "../data/reviewed-cases.json";
import { buildCaseLibrary, parseReviewedCaseRelease } from "../lib/case-library";
import { createKnowledgeRepository } from "../lib/knowledge/knowledge-repository";

const release = () =>
  structuredClone(published) as Record<string, unknown> & {
    managedIds: string[];
    cases: Record<string, unknown>[];
  };

describe("reviewed case release", () => {
  it("ships published reviewed DPs through the validated knowledge snapshot", async () => {
    const snapshot = await createKnowledgeRepository({ asOf: "2026-07-19" }).load();
    const ids = new Set(snapshot.cases.map((item) => item.case_id));

    expect(release().cases.every((item) => ids.has(item.case_id as string))).toBe(true);
  });

  it.each([
    [
      "an unknown schema version",
      (value: ReturnType<typeof release>) => {
        Object.assign(value, { schemaVersion: 2 });
      }
    ],
    [
      "an unapproved publication",
      (value: ReturnType<typeof release>) => {
        Object.assign(value.cases[0], { review_status: "needs_review" });
      }
    ],
    [
      "a publication without a reviewed version",
      (value: ReturnType<typeof release>) => {
        Object.assign(value.cases[0], { reviewed_version: 1 });
      }
    ],
    [
      "an unmanaged publication",
      (value: ReturnType<typeof release>) => {
        Object.assign(value, {
          managedIds: value.managedIds.filter((id) => id !== value.cases[0].case_id)
        });
      }
    ]
  ])("rejects %s", (_label, mutate) => {
    const value = release();
    mutate(value);

    expect(() => parseReviewedCaseRelease(value, [])).toThrow(/reviewed/i);
  });

  it("rejects a published DP that collides with a seed case", () => {
    const value = release();

    expect(() => buildCaseLibrary([{ case_id: value.managedIds[0] }], value)).toThrow(/seed/);
  });
});
