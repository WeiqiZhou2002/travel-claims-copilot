import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { exportCandidate } from "../scripts/export-dp-cases.mjs";

const candidates = JSON.parse(
  readFileSync(
    new URL("../research/airline-dp/uscardforum-demo-001/candidates.json", import.meta.url),
    "utf8"
  )
);
describe("DP preview export", () => {
  it("preserves both airline roles and leaves approval and traveler evidence unclaimed", () => {
    const output = exportCandidate(candidates[1], "candidates.json");
    expect(output.provider).toBe("Alaska Airlines");
    expect(output.carrier).toBe("American Airlines");
    expect(output.review_status).toBe("needs_review");
    expect(output.evidence_used).toEqual([]);
    expect(output.actual_outcome).toContain("intermediate");
    expect(output.notes).toContain("not_reported");
  });
  it("rejects unresolved source references", () => {
    const invalid = structuredClone(candidates[0]);
    invalid.evidence[0].source_id = "missing";
    expect(() => exportCandidate(invalid, "candidates.json")).toThrow("source reference");
  });
  it("does not promote incomplete or old-schema records", () => {
    const invalid = structuredClone(candidates[0]);
    invalid.review.record_status = "incomplete";
    expect(() => exportCandidate(invalid, "candidates.json")).toThrow("not ready");
    invalid.schema_version = "0.2";
    expect(() => exportCandidate(invalid, "candidates.json")).toThrow("0.3");
  });
});
