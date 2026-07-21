import { describe, expect, it } from "vitest";

import {
  buildUnrankedRetrievalTrace,
  regimesFromApplicability
} from "../../lib/domain/policy-applicability";
import { evaluateActiveScenarios } from "../../lib/claim-workflow";
import { resolveClaimContext } from "../../lib/domain/context-resolver";
import { statusFromConditions, topLevelStatus } from "../../lib/domain/remedy-assessment";
import type { RawClaimFacts } from "../../lib/domain/claim-contract";
import type { Policy } from "../../lib/types";
import { claimState, type DeepPartial } from "../fixtures/raw-claims";
import {
  carrierCommitmentFixture,
  knowledgeSnapshotFixture,
  policyFixture
} from "../fixtures/knowledge";
import { remedyById, runWorkflowFixture } from "../fixtures/workflow";
import type {
  CarrierCommitment,
  CarrierCommitmentPredicate
} from "../../lib/knowledge/knowledge-contract";

function commitmentWithHotelPredicates(input: {
  commitmentId: string;
  lastChecked?: string;
  predicates?: CarrierCommitmentPredicate[];
}): CarrierCommitment {
  const base = carrierCommitmentFixture();
  return {
    ...base,
    commitmentId: input.commitmentId,
    lastChecked: input.lastChecked ?? base.lastChecked,
    remedies: base.remedies.map((remedy) =>
      remedy.remedyId === "us_hotel"
        ? { ...remedy, predicates: input.predicates ?? remedy.predicates }
        : remedy
    )
  };
}

function policyAssessment(facts: DeepPartial<RawClaimFacts>, policyOverrides: Partial<Policy>) {
  const context = resolveClaimContext({ state: claimState(facts) });
  return buildUnrankedRetrievalTrace(
    context,
    knowledgeSnapshotFixture({ policies: [policyFixture(policyOverrides)] })
  ).policyApplicability[0];
}

describe("per-remedy assessment", () => {
  it("supports United overnight care only from a matching reviewed commitment", async () => {
    const result = await runWorkflowFixture({
      facts: { operatingCarrier: "United", reasonCategory: "crew", isOvernight: true },
      commitments: [
        carrierCommitmentFixture({ normalizedCarrier: "United", lastChecked: "2026-07-18" })
      ],
      asOf: "2026-07-18"
    });

    expect(remedyById(result, "us_hotel")).toMatchObject({
      status: "supported",
      providerCommitment: {
        normalizedCarrier: "United",
        applicableCarrierRole: "operating_carrier",
        legalRegime: "US_AIRLINE_COMMITMENT",
        commitmentId: expect.any(String)
      }
    });
  });

  it.each([null, "No Matching Commitment Air"])(
    "does not generalize dashboard care for %s",
    async (carrier) => {
      const result = await runWorkflowFixture({
        facts: { operatingCarrier: carrier, reasonCategory: "crew", isOvernight: true },
        commitments: [
          carrierCommitmentFixture({ normalizedCarrier: "United", lastChecked: "2026-07-18" })
        ],
        asOf: "2026-07-18"
      });

      expect(remedyById(result, "us_hotel").status).toBe("conditional");
      expect(remedyById(result, "us_hotel").providerCommitment).toBeUndefined();
    }
  );

  it.each([
    [false, "not_applicable"],
    [null, "conditional"]
  ] as const)("maps membershipAttached=%s to %s", async (membershipAttached, status) => {
    const result = await runWorkflowFixture({
      facts: {
        incidentType: "hotel_walk",
        providerType: "hotel",
        provider: "Marriott",
        operatingCarrier: null,
        confirmedHotelReservation: true,
        qualifyingHotelReservation: true,
        membershipAttached,
        wasWalked: true,
        bookingChannel: "direct"
      }
    });

    expect(remedyById(result, "hotel_guarantee_compensation").status).toBe(status);
  });

  it("keeps remedy-specific exclusions independent", async () => {
    const eu = await runWorkflowFixture({
      facts: {
        incidentType: "airline_delay",
        operatingCarrier: "Air France",
        origin: { airport: "CDG" },
        destination: { airport: "JFK" },
        finalArrivalDelayMinutes: 20,
        reasonCategory: "crew"
      }
    });
    const weather = await runWorkflowFixture({
      facts: { incidentType: "airline_cancellation", reasonCategory: "weather" }
    });
    const voluntary = await runWorkflowFixture({
      facts: {
        incidentType: "denied_boarding",
        origin: { airport: "JFK" },
        deniedBoardingKind: "voluntary",
        oversalesConfirmed: true
      }
    });

    expect(remedyById(eu, "eu_uk_fixed_compensation").status).toBe("not_applicable");
    expect(remedyById(weather, "us_refund").status).not.toBe("not_applicable");
    expect(remedyById(voluntary, "voluntary_bump_offer").status).toBe("supported");
    expect(remedyById(voluntary, "denied_boarding_compensation").status).toBe("not_applicable");
  });

  it("keeps stale and predicate-incomplete carrier records conditional", async () => {
    const stale = await runWorkflowFixture({
      commitments: [carrierCommitmentFixture({ lastChecked: "2026-05-01" })],
      asOf: "2026-07-18"
    });
    const absentOvernight = await runWorkflowFixture({
      facts: { isOvernight: null },
      commitments: [carrierCommitmentFixture()],
      asOf: "2026-07-18"
    });
    const waitPredicate = await runWorkflowFixture({
      commitments: [carrierCommitmentFixture()],
      asOf: "2026-07-18"
    });

    expect(remedyById(stale, "us_hotel").status).toBe("conditional");
    expect(remedyById(absentOvernight, "us_hotel").status).toBe("conditional");
    expect(remedyById(waitPredicate, "us_meal").status).toBe("conditional");
  });

  it.each([
    ["fresh", "2026-07-18", "not_applicable", "excluded"],
    ["stale", "2026-05-01", "conditional", "missing"]
  ] as const)(
    "gives record validity precedence before mixed predicate results for a %s record",
    async (_label, lastChecked, remedyStatus, conditionStatus) => {
      const result = await runWorkflowFixture({
        facts: {
          incidentType: "airline_delay",
          isOvernight: null
        },
        commitments: [
          commitmentWithHotelPredicates({
            commitmentId: "mixed_predicates",
            lastChecked,
            predicates: [
              {
                kind: "event",
                field: "incidentType",
                operator: "one_of",
                values: ["airline_cancellation"]
              },
              {
                kind: "controllability",
                field: "controllability",
                operator: "equals",
                value: "controllable"
              },
              { kind: "overnight", field: "isOvernight", operator: "equals", value: true }
            ]
          })
        ],
        asOf: "2026-07-18"
      });
      const assessment = remedyById(result, "us_hotel");
      const providerCondition = [...assessment.missingConditions, ...assessment.exclusions].find(
        ({ id }) => id === "matching_carrier_commitment"
      );

      expect(assessment.status).toBe(remedyStatus);
      expect(providerCondition?.status).toBe(conditionStatus);
    }
  );

  it.each([
    ["forward", false],
    ["reverse", true]
  ] as const)(
    "selects deterministic evidence from all valid carrier candidates in %s order",
    async (_label, reverse) => {
      const candidates = [
        commitmentWithHotelPredicates({
          commitmentId: "a_old",
          lastChecked: "2026-07-17"
        }),
        commitmentWithHotelPredicates({ commitmentId: "z_valid" }),
        commitmentWithHotelPredicates({ commitmentId: "a_valid" })
      ];
      const result = await runWorkflowFixture({
        commitments: reverse ? candidates.toReversed() : candidates,
        asOf: "2026-07-18"
      });

      expect(remedyById(result, "us_hotel")).toMatchObject({
        status: "supported",
        providerCommitment: { commitmentId: "a_valid" }
      });
    }
  );

  it.each([
    ["stale first", false],
    ["contradicted first", true]
  ] as const)(
    "does not let an invalid first record hide a later valid record: %s",
    async (_, flip) => {
      const cancellationOnly: CarrierCommitmentPredicate[] = [
        {
          kind: "event",
          field: "incidentType",
          operator: "one_of",
          values: ["airline_cancellation"]
        },
        {
          kind: "controllability",
          field: "controllability",
          operator: "equals",
          value: "controllable"
        },
        { kind: "overnight", field: "isOvernight", operator: "equals", value: true }
      ];
      const invalid = flip
        ? commitmentWithHotelPredicates({
            commitmentId: "contradicted",
            predicates: cancellationOnly
          })
        : commitmentWithHotelPredicates({
            commitmentId: "stale",
            lastChecked: "2026-05-01"
          });
      const valid = commitmentWithHotelPredicates({ commitmentId: "valid" });
      const result = await runWorkflowFixture({
        facts: { incidentType: "airline_delay" },
        commitments: [invalid, valid],
        asOf: "2026-07-18"
      });

      expect(remedyById(result, "us_hotel")).toMatchObject({
        status: "supported",
        providerCommitment: { commitmentId: "valid" }
      });
    }
  );

  it("prefers conditional when candidates contain missing and contradicted predicates", async () => {
    const base = carrierCommitmentFixture().remedies.find(
      ({ remedyId }) => remedyId === "us_hotel"
    );
    if (!base) throw new Error("missing hotel remedy fixture");
    const missing = commitmentWithHotelPredicates({
      commitmentId: "missing_wait",
      predicates: [
        ...base.predicates,
        {
          kind: "minimum_wait_minutes",
          field: "waitMinutes",
          operator: "at_least",
          value: 180
        }
      ]
    });
    const excluded = commitmentWithHotelPredicates({
      commitmentId: "excluded_event",
      predicates: [
        {
          kind: "event",
          field: "incidentType",
          operator: "one_of",
          values: ["airline_cancellation"]
        },
        ...base.predicates.filter(({ kind }) => kind !== "event")
      ]
    });
    const result = await runWorkflowFixture({
      facts: { incidentType: "airline_delay" },
      commitments: [excluded, missing]
    });

    expect(remedyById(result, "us_hotel").status).toBe("conditional");
  });

  it("excludes a carrier remedy only when every exact fresh candidate is contradicted", async () => {
    const excludedPredicates: CarrierCommitmentPredicate[] = [
      {
        kind: "event",
        field: "incidentType",
        operator: "one_of",
        values: ["airline_cancellation"]
      },
      {
        kind: "controllability",
        field: "controllability",
        operator: "equals",
        value: "controllable"
      }
    ];
    const result = await runWorkflowFixture({
      facts: { incidentType: "airline_delay" },
      commitments: [
        commitmentWithHotelPredicates({
          commitmentId: "excluded_b",
          predicates: excludedPredicates
        }),
        commitmentWithHotelPredicates({
          commitmentId: "excluded_a",
          predicates: excludedPredicates
        })
      ]
    });

    expect(remedyById(result, "us_hotel").status).toBe("not_applicable");
  });

  it("links every request option to the same existing remedy and final status", async () => {
    const result = await runWorkflowFixture({ commitments: [carrierCommitmentFixture()] });

    result.result.assessments.forEach((assessment) => {
      assessment.requestOptions.forEach((option) => {
        expect(option.remedyId).toBe(assessment.remedyId);
        expect(option.remedyStatus).toBe(assessment.status);
        expect(result.result.assessments.some(({ remedyId }) => remedyId === option.remedyId)).toBe(
          true
        );
      });
    });
  });

  it("records only branch-consumed timing and route facts", async () => {
    const eu = await runWorkflowFixture({
      facts: {
        incidentType: "airline_cancellation",
        operatingCarrier: "Air France",
        origin: { airport: "CDG", city: "New York", country: "United States" },
        destination: { airport: "JFK", city: "Paris", country: "France" },
        finalArrivalDelayMinutes: 20,
        cancellationNoticeHours: 24,
        assistance: {
          refundAccepted: false,
          reroutingAccepted: false,
          replacementTravelOffered: false,
          replacementTravelAccepted: true
        }
      }
    });
    const us = await runWorkflowFixture({
      facts: {
        incidentType: "airline_cancellation",
        origin: { airport: "JFK", city: "Paris", country: "France" },
        destination: { airport: "LAX", city: "London", country: "United Kingdom" },
        finalArrivalDelayMinutes: 20
      }
    });

    expect(remedyById(eu, "eu_uk_care").factsUsed).toEqual([
      "origin.airport",
      "destination.airport",
      "incidentType"
    ]);
    expect(remedyById(eu, "eu_uk_refund_or_rerouting").factsUsed).toEqual([
      "origin.airport",
      "destination.airport",
      "incidentType",
      "assistance.refundAccepted",
      "assistance.reroutingAccepted",
      "assistance.replacementTravelAccepted"
    ]);
    expect(remedyById(eu, "eu_uk_fixed_compensation").factsUsed).not.toContain(
      "cancellationNoticeHours"
    );
    expect(remedyById(eu, "eu_uk_fixed_compensation").factsUsed).not.toContain(
      "assistance.replacementTravelAccepted"
    );
    expect(remedyById(us, "us_refund").factsUsed).toEqual([
      "origin.airport",
      "destination.airport",
      "incidentType",
      "userInitiatedChange",
      "assistance.refundAccepted",
      "assistance.reroutingAccepted"
    ]);
  });

  it("records each attempted location source through the source that resolves the route", async () => {
    const result = await runWorkflowFixture({
      facts: {
        incidentType: "airline_cancellation",
        origin: { airport: "ZZZ", city: "New York", country: null },
        destination: { airport: "LAX" }
      }
    });

    expect(
      remedyById(result, "us_refund").factsUsed.filter((path) => path.startsWith("origin."))
    ).toEqual(["origin.airport", "origin.city"]);
  });

  it("uses the frozen status aggregation rules", () => {
    const matched = {
      id: "us_route" as const,
      label: "US route",
      status: "matched" as const,
      factFields: []
    };
    const missing = { ...matched, status: "missing" as const };
    const excluded = { ...matched, status: "excluded" as const };

    expect(statusFromConditions({ matched: [matched], missing: [], excluded: [] })).toBe(
      "supported"
    );
    expect(statusFromConditions({ matched: [], missing: [missing], excluded: [] })).toBe(
      "conditional"
    );
    expect(statusFromConditions({ matched: [], missing: [missing], excluded: [excluded] })).toBe(
      "not_applicable"
    );
    expect(topLevelStatus([], false)).toBe("needs_information");
  });
});

describe("complete policy applicability", () => {
  it.each([
    [
      "any_route known match",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "LAX" }
      },
      { applicability_rule: "any_route" as const, legal_regime: "US_DOT_REFUND" as const },
      "matchedConditions",
      "route_matched"
    ],
    [
      "any_route known contradiction",
      {
        incidentType: "denied_boarding" as const,
        origin: { airport: "JFK" }
      },
      {
        applicability_rule: "any_route" as const,
        legal_regime: "US_DOT_REFUND" as const,
        incident_types: ["airline_cancellation" as const]
      },
      "exclusions",
      "incident_excluded"
    ],
    [
      "any_route required unknown",
      { incidentType: null },
      { applicability_rule: "any_route" as const, legal_regime: "US_DOT_REFUND" as const },
      "missingConditions",
      "incident_missing"
    ],
    [
      "listed_provider known match",
      {
        incidentType: "airline_cancellation" as const,
        operatingCarrier: "United",
        origin: { airport: "JFK" },
        destination: { airport: "LAX" }
      },
      {
        applicability_rule: "listed_provider" as const,
        legal_regime: "US_AIRLINE_COMMITMENT" as const,
        applicable_providers: ["United"]
      },
      "matchedConditions",
      "provider_scope_matched"
    ],
    [
      "listed_provider known contradiction",
      {
        incidentType: "airline_cancellation" as const,
        operatingCarrier: "Delta",
        origin: { airport: "JFK" },
        destination: { airport: "LAX" }
      },
      {
        applicability_rule: "listed_provider" as const,
        legal_regime: "US_AIRLINE_COMMITMENT" as const,
        applicable_providers: ["United"]
      },
      "exclusions",
      "provider_scope_excluded"
    ],
    [
      "listed_provider required unknown",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "LAX" }
      },
      {
        applicability_rule: "listed_provider" as const,
        legal_regime: "US_AIRLINE_COMMITMENT" as const,
        applicable_providers: ["United"]
      },
      "missingConditions",
      "provider_scope_missing"
    ],
    [
      "origin_region known match",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "LAX" }
      },
      {
        applicability_rule: "origin_region" as const,
        legal_regime: "US_DOT_REFUND" as const,
        applicable_regions: ["US" as const]
      },
      "matchedConditions",
      "route_matched"
    ],
    [
      "origin_region known contradiction",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "CDG" },
        destination: { airport: "JFK" },
        operatingCarrier: "Air France"
      },
      {
        applicability_rule: "origin_region" as const,
        legal_regime: "EU261" as const,
        applicable_regions: ["US" as const]
      },
      "exclusions",
      "route_excluded"
    ],
    [
      "origin_region required unknown",
      {
        incidentType: "airline_cancellation" as const,
        destination: { airport: "LAX" }
      },
      {
        applicability_rule: "origin_region" as const,
        legal_regime: "US_DOT_REFUND" as const,
        applicable_regions: ["US" as const]
      },
      "missingConditions",
      "route_missing"
    ],
    [
      "origin_or_destination_region known match",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "CDG" },
        destination: { airport: "JFK" },
        operatingCarrier: "Air France"
      },
      {
        applicability_rule: "origin_or_destination_region" as const,
        legal_regime: "EU261" as const,
        applicable_regions: ["US" as const]
      },
      "matchedConditions",
      "route_matched"
    ],
    [
      "origin_or_destination_region known contradiction",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "CDG" },
        destination: { airport: "LHR" },
        operatingCarrier: "Air France"
      },
      {
        applicability_rule: "origin_or_destination_region" as const,
        legal_regime: "EU261" as const,
        applicable_regions: ["US" as const]
      },
      "exclusions",
      "route_excluded"
    ],
    [
      "origin_or_destination_region required unknown",
      { incidentType: "airline_cancellation" as const, origin: { airport: "CDG" } },
      {
        applicability_rule: "origin_or_destination_region" as const,
        legal_regime: "EU261" as const,
        applicable_regions: ["US" as const]
      },
      "missingConditions",
      "route_missing"
    ],
    [
      "eu261_route known match",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "CDG" },
        destination: { airport: "JFK" },
        operatingCarrier: "Air France"
      },
      { applicability_rule: "eu261_route" as const, legal_regime: "EU261" as const },
      "matchedConditions",
      "route_matched"
    ],
    [
      "eu261_route known contradiction",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "LAX" },
        operatingCarrier: "United"
      },
      { applicability_rule: "eu261_route" as const, legal_regime: "EU261" as const },
      "exclusions",
      "route_excluded"
    ],
    [
      "eu261_route required unknown",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "CDG" }
      },
      { applicability_rule: "eu261_route" as const, legal_regime: "EU261" as const },
      "missingConditions",
      "route_missing"
    ],
    [
      "uk261_route known match",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "LHR" },
        destination: { airport: "JFK" },
        operatingCarrier: "British Airways"
      },
      { applicability_rule: "uk261_route" as const, legal_regime: "UK261" as const },
      "matchedConditions",
      "route_matched"
    ],
    [
      "uk261_route known contradiction",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "LAX" },
        operatingCarrier: "United"
      },
      { applicability_rule: "uk261_route" as const, legal_regime: "UK261" as const },
      "exclusions",
      "route_excluded"
    ],
    [
      "uk261_route required unknown",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "LHR" }
      },
      { applicability_rule: "uk261_route" as const, legal_regime: "UK261" as const },
      "missingConditions",
      "route_missing"
    ],
    [
      "australia_consumer_law known match",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "SYD" },
        destination: { airport: "MEL" }
      },
      { applicability_rule: "australia_consumer_law" as const, legal_regime: "AU_ACL" as const },
      "matchedConditions",
      "route_matched"
    ],
    [
      "australia_consumer_law known contradiction",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "LAX" }
      },
      { applicability_rule: "australia_consumer_law" as const, legal_regime: "AU_ACL" as const },
      "exclusions",
      "route_excluded"
    ],
    [
      "australia_consumer_law required unknown",
      { incidentType: "airline_cancellation" as const, destination: { airport: "MEL" } },
      { applicability_rule: "australia_consumer_law" as const, legal_regime: "AU_ACL" as const },
      "missingConditions",
      "route_missing"
    ],
    [
      "china_flight_regulation known match",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "PVG" },
        destination: { airport: "NRT" },
        operatingCarrier: "China Eastern Airlines"
      },
      {
        applicability_rule: "china_flight_regulation" as const,
        legal_regime: "CN_FLIGHT_REGULATION" as const
      },
      "matchedConditions",
      "route_matched"
    ],
    [
      "china_flight_regulation known contradiction",
      {
        incidentType: "airline_cancellation" as const,
        origin: { airport: "JFK" },
        destination: { airport: "LAX" },
        operatingCarrier: "United"
      },
      {
        applicability_rule: "china_flight_regulation" as const,
        legal_regime: "CN_FLIGHT_REGULATION" as const
      },
      "exclusions",
      "route_excluded"
    ],
    [
      "china_flight_regulation required unknown",
      { incidentType: "airline_cancellation" as const, origin: { airport: "JFK" } },
      {
        applicability_rule: "china_flight_regulation" as const,
        legal_regime: "CN_FLIGHT_REGULATION" as const
      },
      "missingConditions",
      "route_missing"
    ]
  ])("evaluates $0", (_label, facts, policy, bucket, reason) => {
    const conditionBucket = bucket as "matchedConditions" | "missingConditions" | "exclusions";
    expect(policyAssessment(facts, policy)[conditionBucket]).toContain(reason);
  });

  it("uses active, unresolved, excluded, and unmapped scenario dimensions", () => {
    const activeUs = policyAssessment(
      {
        incidentType: "airline_cancellation",
        origin: { airport: "JFK" },
        destination: { airport: "LAX" },
        operatingCarrier: "United"
      },
      { legal_regime: "US_DOT_REFUND" }
    );
    const unresolvedEu = policyAssessment(
      {
        incidentType: "airline_cancellation",
        origin: { airport: "JFK" },
        operatingCarrier: "United"
      },
      { legal_regime: "EU261", applicability_rule: "eu261_route" }
    );
    const unmapped = policyAssessment(
      {
        incidentType: "airline_cancellation",
        origin: { airport: "SYD" },
        destination: { airport: "MEL" }
      },
      { legal_regime: "AU_ACL", applicability_rule: "australia_consumer_law" }
    );

    expect(activeUs.matchedConditions).toContain("scenario_matched");
    expect(unresolvedEu.missingConditions).toContain("scenario_missing");
    expect(unresolvedEu.status).toBe("conditional");
    expect(unmapped.exclusions).toContain("scenario_excluded");
    expect(unmapped.status).toBe("not_applicable");
  });

  it("does not leak EU261 into a US denied-boarding scenario", () => {
    const context = resolveClaimContext({
      state: claimState({
        incidentType: "denied_boarding",
        origin: { airport: "JFK" },
        destination: { airport: "CDG" },
        operatingCarrier: "Air France",
        deniedBoardingKind: "involuntary"
      })
    });
    const trace = buildUnrankedRetrievalTrace(
      context,
      knowledgeSnapshotFixture({
        policies: [
          policyFixture({
            incident_types: ["denied_boarding"],
            legal_regime: "EU261",
            applicability_rule: "eu261_route"
          })
        ]
      })
    );

    expect(trace.policyApplicability[0]).toMatchObject({ status: "not_applicable" });
    expect(trace.policyApplicability[0].matchedConditions).toContain("route_matched");
    expect(trace.policyApplicability[0].exclusions).toContain("scenario_excluded");
    expect(regimesFromApplicability(trace.policyApplicability)).not.toContain("EU261");
  });

  it("records the normalized provider that satisfied listed-provider scope", () => {
    const context = resolveClaimContext({
      state: claimState({
        incidentType: "hotel_walk",
        providerType: "hotel",
        provider: "Sheraton",
        confirmedHotelReservation: true,
        wasWalked: true
      })
    });
    const trace = buildUnrankedRetrievalTrace(
      context,
      knowledgeSnapshotFixture({
        policies: [
          policyFixture({
            incident_types: ["hotel_walk"],
            legal_regime: "provider_policy",
            applicability_rule: "listed_provider",
            applicable_providers: ["Marriott"]
          })
        ]
      })
    );

    expect(trace.policyApplicability[0]).toMatchObject({
      status: "applicable",
      applicableCarrier: "Marriott"
    });
  });

  it("evaluates every policy before display ranking and preserves regime order", () => {
    const context = resolveClaimContext({
      state: claimState({
        incidentType: "airline_cancellation",
        providerType: "airline",
        operatingCarrier: "United",
        origin: { airport: "JFK" },
        destination: { airport: "LAX" },
        reasonCategory: "weather"
      })
    });
    const knowledge = knowledgeSnapshotFixture({
      policies: [
        policyFixture({ policy_id: "refund", legal_regime: "US_DOT_REFUND" }),
        policyFixture({
          policy_id: "carrier",
          legal_regime: "US_AIRLINE_COMMITMENT",
          applicability_rule: "listed_provider",
          applicable_providers: ["United"],
          required_controllability: "controllable"
        }),
        policyFixture({
          policy_id: "eu",
          legal_regime: "EU261",
          applicability_rule: "eu261_route"
        })
      ]
    });
    const trace = buildUnrankedRetrievalTrace(context, knowledge);

    expect(trace.policyApplicability).toHaveLength(3);
    expect(trace.policyApplicability.map(({ status }) => status)).toEqual([
      "applicable",
      "not_applicable",
      "not_applicable"
    ]);
    expect(regimesFromApplicability(trace.policyApplicability)).toEqual(["US_DOT_REFUND"]);
    expect(trace.displayedPolicies).toEqual([]);
    expect(trace.displayedCases).toEqual([]);
    expect(trace.displayedScripts).toEqual([]);
  });

  it("keeps remedies and regimes independent from empty display arrays", () => {
    const context = resolveClaimContext({
      state: claimState({
        incidentType: "airline_cancellation",
        operatingCarrier: "United",
        origin: { airport: "JFK" },
        destination: { airport: "LAX" },
        reasonCategory: "crew",
        isOvernight: true
      })
    });
    const knowledge = knowledgeSnapshotFixture({
      policies: [policyFixture()],
      carrierCommitments: [carrierCommitmentFixture()]
    });
    const first = evaluateActiveScenarios({ context, knowledge, asOf: "2026-07-18" });
    const trace = buildUnrankedRetrievalTrace(context, knowledge);
    const regimes = regimesFromApplicability(trace.policyApplicability);
    const changedPresentation = {
      ...trace,
      displayedPolicies: [{ item: policyFixture(), reasons: [], score: 999 }]
    };

    expect(evaluateActiveScenarios({ context, knowledge, asOf: "2026-07-18" })).toEqual(first);
    expect(regimesFromApplicability(changedPresentation.policyApplicability)).toEqual(regimes);
  });
});
