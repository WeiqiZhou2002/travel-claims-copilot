import { describe, it, expect } from "vitest";
import { processIntake } from "../lib/intake";
import { emptyClaimFacts } from "../lib/claimFacts";
import { claimFactsToExtractedFacts } from "../lib/analyze";
import { buildRetrievalQuery, retrieveKnowledge } from "../lib/retrieval";
import { rankCases } from "../lib/retrievalScoring";
import { findOperatingCarrierMatch } from "../lib/provider";
import raw from "../data/cases.json";
import type { Case } from "../lib/types";

const existing = raw as Case[];
const base = existing.find(c => c.case_id === "uscf_aa127_mechanical_delay_overnight_2026_07")!;

describe("ticketing provider and operating carrier", () => {
  it("extracts AS-issued AA and preserves the pair through structured retrieval", async () => {
    const intake = await processIntake("AS出AA的航班，从纽约到洛杉矶因天气取消，我在机场。", emptyClaimFacts(), { llmClient: null });
    expect(intake.facts.bookingProvider).toBe("Alaska Airlines");
    expect(intake.facts.operatingCarrier).toBe("American Airlines");
    const q = buildRetrievalQuery(claimFactsToExtractedFacts(intake.facts));
    expect(q.ticketingProvider).toBe("Alaska Airlines");
    expect(q.carrier).toBe("American Airlines");
  });
  it("does not treat an ordinary English 'as' as an airline", () => {
    expect(findOperatingCarrierMatch("As a passenger, my United flight was delayed.")?.provider).toBe("United");
    expect(findOperatingCarrierMatch("My ticket was issued by Lufthansa. The flight was cancelled.")).toBeUndefined();
  });
  it("ranks the matching pair above either single-role match", () => {
    const q = buildRetrievalQuery({ issueType: "airline_delay", providerType: "airline", ticketingProvider: "AS", operatingCarrier: "AA", description: "", confidence: "high", signals: [], source: "keyword" });
    const pair = { ...base, case_id: "pair", provider: "Alaska Airlines", carrier: "American Airlines" };
    const sameCarrier = { ...pair, case_id: "same-carrier", provider: "American Airlines" };
    const sameIssuer = { ...pair, case_id: "same-issuer", carrier: "Delta" };
    const ranked = rankCases(q, [sameCarrier, sameIssuer, pair]);
    expect(ranked[0].item.case_id).toBe("pair");
    expect(ranked[0].reasons).toContain("provider_carrier_pair_match");
  });
  it("never matches an issuer against the carrier role", () => {
    const q = buildRetrievalQuery({ issueType: "airline_delay", providerType: "airline", ticketingProvider: "AA", description: "", confidence: "high", signals: [], source: "keyword" });
    expect(rankCases(q, [{ ...base, provider: "Alaska Airlines", carrier: "American Airlines" }])).toEqual([]);
  });
  it("requires both roles for an approved analogue with unnormalized geography", () => {
    const q = buildRetrievalQuery({ issueType: "airline_delay", providerType: "airline", ticketingProvider: "AS", operatingCarrier: "AA", policyRegions: ["US"], description: "", confidence: "high", signals: [], source: "keyword" });
    const item = { ...base, provider: "Alaska Airlines", carrier: "American Airlines", location_country: "unknown" };
    expect(rankCases(q, [item])[0]?.reasons).toContain("route_scope_unknown");
    expect(rankCases({ ...q, ticketingProvider: undefined }, [item])).toEqual([]);
    expect(rankCases(q, [{ ...item, review_status: "needs_review" }])).toEqual([]);
  });
  it("preserves roles when selecting an existing case and does not invent issuers", () => {
    const result = retrieveKnowledge({ issueType: "unknown", caseId: base.case_id, description: "", confidence: "low", signals: [], source: "fallback" }, [], existing, []);
    expect(result.query.ticketingProvider).toBe("Alaska Airlines");
    expect(result.query.carrier).toBe("American Airlines");
    expect(existing.find(c => c.case_id === "uscf_delta_six_hours_cancel_sfo_lax_2026_02")?.provider).toBeNull();
  });
});
