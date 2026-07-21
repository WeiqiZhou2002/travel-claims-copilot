import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DATASET_VERSION,
  loadEvalCases,
  parseEvalCase,
  type EvalTag
} from "../../evals/eval-contract";

const datasetPath = path.join(process.cwd(), "evals/cases/v1.jsonl");

describe("four-scenario-v1 bilingual dataset", () => {
  it("contains exactly 48 anonymous balanced synthetic cases", () => {
    const cases = loadEvalCases(datasetPath);

    expect(DATASET_VERSION).toBe("four-scenario-v1");
    expect(cases).toHaveLength(48);
    expect(new Set(cases.map(({ id }) => id)).size).toBe(48);
    expect(cases.filter(({ language }) => language === "en")).toHaveLength(24);
    expect(cases.filter(({ language }) => language === "zh")).toHaveLength(24);
    expect(cases.filter(({ tags }) => tags.some((tag) => tag.startsWith("journey:")))).toHaveLength(
      32
    );
    expect(cases.filter(({ tags }) => tags.includes("ambiguity"))).toHaveLength(8);
    expect(cases.filter(({ tags }) => tags.includes("high_risk"))).toHaveLength(4);
    expect(cases.filter(({ tags }) => tags.includes("injection"))).toHaveLength(4);

    const journeyTags: EvalTag[] = [
      "journey:marriott_hotel_walk",
      "journey:us_airline_disruption",
      "journey:us_denied_boarding",
      "journey:eu_uk_air_disruption"
    ];
    journeyTags.forEach((tag) => {
      const journey = cases.filter(({ tags }) => tags.includes(tag));
      expect(journey).toHaveLength(8);
      expect(journey.filter(({ language }) => language === "en")).toHaveLength(4);
      expect(journey.filter(({ language }) => language === "zh")).toHaveLength(4);
    });

    cases.forEach((item) => {
      expect(item.datasetVersion).toBe(DATASET_VERSION);
      expect(item.synthetic).toBe(true);
      expect(item.input).not.toMatch(
        /(?:booking|ticket|membership|payment)\s*(?:code|number|#)|\b[A-Z]{2}\d{6,}\b/i
      );
    });
  });

  it("rejects unknown keys and derived-fact expectations", () => {
    const valid = loadEvalCases(datasetPath)[0];
    expect(() => parseEvalCase({ ...valid, privateResponse: "forbidden" })).toThrow(
      "eval_case_keys_invalid"
    );
    expect(() =>
      parseEvalCase({
        ...valid,
        expected: {
          ...valid.expected,
          acceptedCriticalValues: { region: ["US"] }
        }
      })
    ).toThrow("eval_case_critical_path_invalid");
  });
});
