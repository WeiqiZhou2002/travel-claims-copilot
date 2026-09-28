import { describe, expect, it, vi } from "vitest";
import {
  emptyClaimFacts,
  normalizeClaimFacts,
  parseClaimFacts,
  getMissingClaimFields,
  type ClaimFacts,
  type ClaimDisruptionReason,
} from "../lib/claimFacts";
import { processIntake } from "../lib/intake";
import {
  buildAnalysisFromFacts,
  claimFactsToExtractedFacts,
} from "../lib/analyze";
import {
  controllabilityFromReason,
  passengerSideCompensationExplanation,
} from "../lib/policyScope";
import { buildRetrievalQuery } from "../lib/retrieval";
import { rankCases, rankScripts } from "../lib/retrievalScoring";
import rawPolicies from "../data/policies.json";
import rawScripts from "../data/scripts.json";
import rawCases from "../data/cases.json";
import type { Case, Policy, Script, LegalRegime } from "../lib/types";

const policies = rawPolicies as Policy[];
const scripts = rawScripts as Script[];
const cases = rawCases as Case[];
const facts = (overrides: Partial<ClaimFacts> = {}): ClaimFacts => ({
  ...emptyClaimFacts(),
  providerType: "airline",
  provider: "United",
  operatingCarrier: "United",
  origin: {
    city: "New York",
    airport: "JFK",
    country: "United States",
    region: "US",
  },
  destination: {
    city: "Los Angeles",
    airport: "LAX",
    country: "United States",
    region: "US",
  },
  issueType: "denied_boarding",
  deniedBoardingKind: "involuntary",
  disruptionReason: "passenger_side",
  disruptionReasonStatus: "not_provided",
  journeyStage: "at_airport",
  confidence: "high",
  ...overrides,
});
const analyze = (input: ClaimFacts, sources = policies) =>
  buildAnalysisFromFacts(input, sources, cases, scripts);

// These tests validate the model-output contract and deterministic rules, not real model accuracy.
describe("reported cause intake and normalization", () => {
  it.each(["passenger_side", "other_reported"] as const)(
    "accepts %s in the runtime schema and marks it reported",
    (reason) => {
      const input = facts({
        disruptionReason: reason,
        disruptionReasonStatus: "unavailable",
        issueType: "airline_cancellation",
      });
      const parsed = parseClaimFacts(input);
      expect(parsed.success).toBe(true);
      if (!parsed.success) throw new Error("Expected valid reason");
      expect(parsed.data.disruptionReasonStatus).toBe("reported");
      expect(getMissingClaimFields(parsed.data)).not.toContain(
        "disruptionReason",
      );
    },
  );
  it("keeps a known passenger-side refusal ready without asking for its reason again", async () => {
    const generate = vi.fn().mockResolvedValue(facts());
    const result = await processIntake(
      "I was refused boarding because my passport is invalid. I am at the airport.",
      emptyClaimFacts(),
      { llmClient: { generate } },
    );
    expect(result).toMatchObject({
      status: "ready",
      question: null,
      extractionMode: "llm",
      facts: {
        disruptionReason: "passenger_side",
        disruptionReasonStatus: "reported",
      },
    });
    expect(result.missingFields).not.toContain("disruptionReason");
    const reasonEnum =
      generate.mock.calls[0][0].schema.properties.disruptionReason.enum;
    expect(reasonEnum).toEqual(
      expect.arrayContaining(["passenger_side", "other_reported"]),
    );
  });
  it.each(["airline_cancellation", "airline_delay"] as const)(
    "does not re-ask a reported but uncategorized %s cause",
    async (issueType) => {
      const result = await processIntake(
        "Air traffic control caused the disruption. I am at the airport.",
        emptyClaimFacts(),
        {
          llmClient: {
            generate: vi
              .fn()
              .mockResolvedValue(
                facts({ issueType, disruptionReason: "other_reported" }),
              ),
          },
        },
      );
      expect(result.status).toBe("ready");
      expect(result.facts.disruptionReasonStatus).toBe("reported");
      expect(result.missingFields).not.toContain("disruptionReason");
      expect(result.question).toBeNull();
    },
  );
  it("does not overwrite a model-reported airline check-in system fault as passenger-side", async () => {
    const result = await processIntake(
      "My passport check was late because the airline check-in system failed.",
      emptyClaimFacts(),
      {
        llmClient: {
          generate: vi
            .fn()
            .mockResolvedValue(
              facts({ disruptionReason: "other_controllable" }),
            ),
        },
      },
    );
    expect(result.facts.disruptionReason).toBe("other_controllable");
    expect(controllabilityFromReason(result.facts.disruptionReason)).toBe(
      "controllable",
    );
  });
  it("continues to distinguish unknown/not provided from explicitly unavailable", () => {
    const absent = normalizeClaimFacts(
      facts({ issueType: "airline_cancellation", disruptionReason: "unknown" }),
    );
    expect(getMissingClaimFields(absent)).toContain("disruptionReason");
    const unavailable = normalizeClaimFacts({
      ...absent,
      disruptionReasonStatus: "unavailable",
    });
    expect(getMissingClaimFields(unavailable)).not.toContain(
      "disruptionReason",
    );
  });
  it.each<[ClaimDisruptionReason, string]>([
    ["passenger_side", "uncontrollable"],
    ["other_reported", "unknown"],
    ["oversales", "unknown"],
    ["mechanical", "controllable"],
  ])(
    "maps %s to airline-perspective controllability %s",
    (reason, expected) => {
      expect(controllabilityFromReason(reason)).toBe(expected);
    },
  );
});

const jurisdictions: {
  regime: LegalRegime;
  provider: string;
  origin: ClaimFacts["origin"];
}[] = [
  {
    regime: "US_DOT_DENIED_BOARDING",
    provider: "United",
    origin: facts().origin,
  },
  {
    regime: "EU261",
    provider: "Air France",
    origin: {
      city: "Paris",
      airport: "CDG",
      country: "France",
      region: "EU_EEA_CH",
    },
  },
  {
    regime: "UK261",
    provider: "British Airways",
    origin: {
      city: "London",
      airport: "LHR",
      country: "United Kingdom",
      region: "UK",
    },
  },
  {
    regime: "CA_APPR",
    provider: "Air Canada",
    origin: {
      city: "Toronto",
      airport: "YYZ",
      country: "Canada",
      region: "CA",
    },
  },
];
describe("deterministic passenger-side compensation exclusions", () => {
  it.each(jurisdictions)(
    "excludes passenger-side boarding compensation for $regime",
    ({ regime, provider, origin }) => {
      const result = analyze(
        facts({ provider, operatingCarrier: provider, origin }),
      );
      const policy = policies.find((p) => p.legal_regime === regime)!;
      const assessment = result.policyAssessments.find(
        (a) => a.policyId === policy.policy_id,
      );
      expect(
        assessment?.conditions.find((c) => c.code === "denied_boarding_kind"),
      ).toMatchObject({
        status: "not_met",
        detail: passengerSideCompensationExplanation,
      });
      expect(
        result.remedies.find((r) => r.id === "fixed_compensation"),
      ).toMatchObject({
        status: "not_supported",
        explanation: passengerSideCompensationExplanation,
      });
      expect(
        result.scripts.some(
          (s) => s.required_denied_boarding_kind === "involuntary",
        ),
      ).toBe(false);
      expect(result.evidenceChecklist).not.toContain(
        "Written denied-boarding statement if involuntary",
      );
      expect(result.cautions).toContain(
        "证件/值机问题通常不产生强制补偿，可询问改签、退款或票规内的选择",
      );
      expect(result.suggestedAsks.standard.join(" ")).not.toContain(
        "assessment of compensation",
      );
    },
  );
  it.each(["unknown", "voluntary"] as const)(
    "does not defer a known passenger-side exclusion when kind is %s",
    (deniedBoardingKind) => {
      const result = analyze(facts({ deniedBoardingKind }));
      expect(
        result.policyAssessments
          .find((a) => a.policyId === "dot_bumping_oversales")
          ?.conditions.find((c) => c.code === "denied_boarding_kind")?.status,
      ).toBe("not_met");
    },
  );
  it("preserves the reason-specific explanation even without a matching policy", () => {
    const result = analyze(facts(), []);
    expect(
      result.remedies.find((r) => r.id === "fixed_compensation"),
    ).toMatchObject({
      status: "not_supported",
      explanation: passengerSideCompensationExplanation,
    });
    expect(result.evidenceChecklist).not.toContain(
      "Written denied-boarding statement if involuntary",
    );
  });
  it("keeps involuntary oversales on the existing DOT verification path with its script", () => {
    const result = analyze(facts({ disruptionReason: "oversales" }));
    expect(
      result.policyAssessments
        .find((a) => a.policyId === "dot_bumping_oversales")
        ?.conditions.find((c) => c.code === "denied_boarding_kind")?.status,
    ).toBe("met");
    expect(
      result.remedies.find((r) => r.id === "fixed_compensation")?.status,
    ).toBe("needs_verification");
    expect(result.scripts.map((s) => s.script_id)).toContain(
      "denied_boarding_involuntary_email_en",
    );
    expect(result.evidenceChecklist).toContain(
      "Written denied-boarding statement if involuntary",
    );
  });
  it("excludes all involuntary scripts in ranking, even without remedy metadata", () => {
    const input = claimFactsToExtractedFacts(facts());
    const candidate = {
      ...scripts.find(
        (s) => s.required_denied_boarding_kind === "involuntary",
      )!,
      remedy: undefined,
    };
    const query = buildRetrievalQuery(input);
    expect(rankScripts(query, [candidate])).toEqual([]);
    expect(
      rankScripts({ ...query, disruptionReason: "oversales" }, [candidate]),
    ).toHaveLength(1);
  });
  it("does not treat other_reported as an automatic compensation exclusion", () => {
    const result = analyze(facts({ disruptionReason: "other_reported" }));
    expect(result.controllability).toBe("unknown");
    expect(
      result.policyAssessments
        .find((a) => a.policyId === "dot_bumping_oversales")
        ?.conditions.find((c) => c.code === "denied_boarding_kind")?.status,
    ).toBe("unknown");
    expect(
      result.remedies.find((r) => r.id === "fixed_compensation")?.status,
    ).toBe("needs_verification");
  });
  it("does not infer a contradictory cause or cause match bonus from other_reported", () => {
    const base = cases.find(
      (c) =>
        c.provider_type === "airline" &&
        c.issue_type === "airline_cancellation" &&
        c.review_status === "approved",
    )!;
    const candidate = {
      ...base,
      provider: null,
      carrier: "United",
      location_country: "United States",
      facts: "United cancelled due to weather.",
      actual_outcome: "Rebooked.",
      source_type: "community_dp" as const,
    };
    const query = buildRetrievalQuery(
      claimFactsToExtractedFacts(
        facts({
          issueType: "airline_cancellation",
          disruptionReason: "other_reported",
          deniedBoardingKind: "unknown",
        }),
      ),
    );
    const ranked = rankCases(query, [candidate]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].reasons).not.toContain("disruption_reason_match");
  });
});
