import { describe, expect, it } from "vitest";

import type {
  ConditionId,
  RawClaimFacts,
  RawFactPath,
  RemedyConditionEvaluation,
  RemedyId,
  ScenarioId
} from "../../lib/domain/claim-contract";
import { CONDITION_IDS, RAW_FACT_PATHS } from "../../lib/domain/claim-contract";
import { resolveClaimContext } from "../../lib/domain/context-resolver";
import { mergeRawFacts } from "../../lib/domain/fact-merge";
import { evaluateScenarioConditions, evaluatorFor } from "../../lib/domain/scenario-evaluator";
import { claimState, rawFacts, type DeepPartial } from "../fixtures/raw-claims";

type EvaluatorFixture = {
  name: string;
  scenario: ScenarioId;
  facts: DeepPartial<RawClaimFacts>;
  remedyId: RemedyId;
  missing?: ConditionId;
  excluded?: ConditionId;
};

const scenarioDefaults: Record<ScenarioId, DeepPartial<RawClaimFacts>> = {
  marriott_hotel_walk: {
    incidentType: "hotel_walk",
    provider: "Marriott",
    confirmedHotelReservation: true,
    qualifyingHotelReservation: true,
    membershipAttached: true,
    bookingChannel: "direct",
    wasWalked: true,
    replacementLodgingProvided: false
  },
  us_airline_disruption: {
    incidentType: "airline_cancellation",
    origin: { airport: "JFK" },
    destination: { airport: "LAX" },
    userInitiatedChange: false,
    assistance: { refundAccepted: false, reroutingAccepted: false },
    reasonCategory: "crew",
    isOvernight: true
  },
  us_denied_boarding: {
    incidentType: "denied_boarding",
    origin: { airport: "JFK" },
    deniedBoardingKind: "involuntary",
    oversalesConfirmed: true,
    confirmedReservation: true,
    checkedInOnTime: true,
    atGateOnTime: true,
    documentsCompliant: true,
    replacementArrivalDelayMinutes: 0
  },
  eu_uk_air_disruption: {
    incidentType: "airline_delay",
    origin: { airport: "CDG" },
    destination: { airport: "LHR" },
    operatingCarrier: "Air France",
    finalArrivalDelayMinutes: 240,
    assistance: {
      refundAccepted: false,
      reroutingAccepted: false,
      replacementTravelAccepted: false
    },
    reasonCategory: "crew"
  }
};

function scenarioFacts(
  scenario: ScenarioId,
  overrides: DeepPartial<RawClaimFacts> = {}
): RawClaimFacts {
  const defaults = rawFacts(scenarioDefaults[scenario]);
  return rawFacts({
    ...defaults,
    ...overrides,
    origin: { ...defaults.origin, ...overrides.origin },
    destination: { ...defaults.destination, ...overrides.destination },
    assistance: { ...defaults.assistance, ...overrides.assistance }
  });
}

function contextFor(
  scenario: ScenarioId,
  overrides: DeepPartial<RawClaimFacts> = {},
  unresolvedFields: RawFactPath[] = []
) {
  return resolveClaimContext({
    state: claimState(scenarioFacts(scenario, overrides), 0, { unresolvedFields })
  });
}

function remedyFor(
  scenario: ScenarioId,
  remedyId: RemedyId,
  overrides: DeepPartial<RawClaimFacts> = {},
  unresolvedFields: RawFactPath[] = []
): RemedyConditionEvaluation {
  const result = evaluatorFor(scenario).evaluateConditions(
    contextFor(scenario, overrides, unresolvedFields)
  );
  const remedy = result.remedies.find((item) => item.remedyId === remedyId);
  if (!remedy) throw new Error(`missing remedy ${remedyId}`);
  return remedy;
}

function conditionIds(
  remedy: RemedyConditionEvaluation,
  bucket: "matchedConditions" | "missingConditions" | "exclusions"
): ConditionId[] {
  return remedy[bucket].map(({ id }) => id);
}

const requiredFixtures: EvaluatorFixture[] = [
  {
    name: "Marriott missing membership",
    scenario: "marriott_hotel_walk",
    facts: { membershipAttached: null },
    remedyId: "hotel_guarantee_compensation",
    missing: "membership_attached"
  },
  {
    name: "US weather cancellation",
    scenario: "us_airline_disruption",
    facts: { incidentType: "airline_cancellation", reasonCategory: "weather" },
    remedyId: "us_hotel",
    excluded: "controllable_disruption"
  },
  {
    name: "voluntary bump",
    scenario: "us_denied_boarding",
    facts: { incidentType: "denied_boarding", deniedBoardingKind: "voluntary" },
    remedyId: "denied_boarding_compensation",
    excluded: "involuntary_boarding"
  },
  {
    name: "20 minute EU delay",
    scenario: "eu_uk_air_disruption",
    facts: { incidentType: "airline_delay", finalArrivalDelayMinutes: 20 },
    remedyId: "eu_uk_fixed_compensation",
    excluded: "three_hour_arrival_delay"
  }
];

describe("four scenario condition matrices", () => {
  it.each(requiredFixtures)(
    "evaluates $name",
    ({ scenario, facts, remedyId, missing, excluded }) => {
      const remedy = remedyFor(scenario, remedyId, facts);

      if (missing) expect(conditionIds(remedy, "missingConditions")).toContain(missing);
      if (excluded) expect(conditionIds(remedy, "exclusions")).toContain(excluded);
    }
  );

  it.each([
    ["Marriott", "marriott_hotel_walk", "hotel_guarantee_compensation", {}, "membership_attached"],
    ["US disruption", "us_airline_disruption", "us_hotel", {}, "overnight_disruption"],
    [
      "US denied boarding",
      "us_denied_boarding",
      "denied_boarding_compensation",
      {},
      "replacement_arrival_delay"
    ],
    [
      "EU/UK disruption",
      "eu_uk_air_disruption",
      "eu_uk_fixed_compensation",
      { finalArrivalDelayMinutes: 180 },
      "three_hour_arrival_delay"
    ]
  ] as const)(
    "matches a positive %s matrix",
    (_name, scenario, remedyId, overrides, matchedCondition) => {
      const remedy = remedyFor(scenario, remedyId, overrides);

      expect(remedy.exclusions).toEqual([]);
      expect(remedy.missingConditions).toEqual([]);
      expect(conditionIds(remedy, "matchedConditions")).toContain(matchedCondition);
    }
  );

  it.each([
    [
      "Marriott",
      "marriott_hotel_walk",
      "hotel_guarantee_compensation",
      { membershipAttached: null },
      "membership_attached"
    ],
    [
      "US disruption",
      "us_airline_disruption",
      "us_hotel",
      { reasonCategory: null },
      "controllable_disruption"
    ],
    [
      "US denied boarding",
      "us_denied_boarding",
      "denied_boarding_compensation",
      { documentsCompliant: null },
      "documents_compliant"
    ],
    [
      "EU/UK disruption",
      "eu_uk_air_disruption",
      "eu_uk_fixed_compensation",
      { finalArrivalDelayMinutes: null },
      "three_hour_arrival_delay"
    ]
  ] as const)(
    "keeps a missing %s predicate conditional",
    (_name, scenario, remedyId, overrides, missingCondition) => {
      expect(conditionIds(remedyFor(scenario, remedyId, overrides), "missingConditions")).toContain(
        missingCondition
      );
    }
  );

  it.each([
    [
      "Marriott",
      "marriott_hotel_walk",
      "hotel_guarantee_compensation",
      { bookingChannel: "ota" },
      "qualifying_booking_channel"
    ],
    [
      "US disruption",
      "us_airline_disruption",
      "us_hotel",
      { reasonCategory: "weather" },
      "controllable_disruption"
    ],
    [
      "US denied boarding",
      "us_denied_boarding",
      "denied_boarding_compensation",
      { deniedBoardingKind: "voluntary" },
      "involuntary_boarding"
    ],
    [
      "EU/UK disruption",
      "eu_uk_air_disruption",
      "eu_uk_fixed_compensation",
      { finalArrivalDelayMinutes: 20 },
      "three_hour_arrival_delay"
    ]
  ] as const)("records a known %s exclusion", (_name, scenario, remedyId, overrides, exclusion) => {
    expect(conditionIds(remedyFor(scenario, remedyId, overrides), "exclusions")).toContain(
      exclusion
    );
  });

  it.each([
    [119, "excluded"],
    [120, "missing"],
    [239, "missing"],
    [240, "matched"]
  ] as const)("evaluates the EU/UK care boundary at %i minutes", (minutes, status) => {
    const remedy = remedyFor("eu_uk_air_disruption", "eu_uk_care", {
      finalArrivalDelayMinutes: minutes
    });
    let bucket = remedy.exclusions;
    if (status === "missing") bucket = remedy.missingConditions;
    if (status === "matched") bucket = remedy.matchedConditions;

    expect(bucket).toContainEqual(expect.objectContaining({ id: "care_delay_threshold", status }));
  });

  it("keeps weather independent from reason-independent US refund eligibility", () => {
    const refund = remedyFor("us_airline_disruption", "us_refund", {
      reasonCategory: "weather"
    });
    const hotel = remedyFor("us_airline_disruption", "us_hotel", {
      reasonCategory: "weather"
    });

    expect(refund.exclusions).toEqual([]);
    expect(conditionIds(refund, "matchedConditions")).toEqual(
      expect.arrayContaining([
        "us_route",
        "delay_or_cancellation",
        "traveler_did_not_initiate",
        "refund_alternative_declined"
      ])
    );
    expect(conditionIds(hotel, "exclusions")).toContain("controllable_disruption");
  });

  it("does not promote a US delay to a significant-change refund predicate", () => {
    const refund = remedyFor("us_airline_disruption", "us_refund", {
      incidentType: "airline_delay",
      finalArrivalDelayMinutes: 600
    });

    expect(conditionIds(refund, "missingConditions")).toContain("delay_or_cancellation");
    expect(conditionIds(refund, "exclusions")).not.toContain("delay_or_cancellation");
  });

  it.each([
    [{ refundAccepted: false, reroutingAccepted: false }, "matched"],
    [{ refundAccepted: true, reroutingAccepted: false }, "excluded"],
    [{ refundAccepted: false, reroutingAccepted: null }, "missing"]
  ] as const)("maps US refund alternatives to %s", (assistance, status) => {
    const remedy = remedyFor("us_airline_disruption", "us_refund", { assistance });
    const allConditions = [
      ...remedy.matchedConditions,
      ...remedy.missingConditions,
      ...remedy.exclusions
    ];

    expect(allConditions).toContainEqual(
      expect.objectContaining({ id: "refund_alternative_declined", status })
    );
  });

  it.each([
    [{ reroutingAccepted: false }, "matched"],
    [{ reroutingAccepted: true }, "excluded"],
    [{ reroutingAccepted: null }, "missing"]
  ] as const)("maps US rerouting acceptance to %s", (assistance, status) => {
    const remedy = remedyFor("us_airline_disruption", "us_rerouting", { assistance });
    const allConditions = [
      ...remedy.matchedConditions,
      ...remedy.missingConditions,
      ...remedy.exclusions
    ];

    expect(allConditions).toContainEqual(
      expect.objectContaining({ id: "refund_alternative_declined", status })
    );
  });

  it.each([
    [
      { refundAccepted: false, reroutingAccepted: false, replacementTravelAccepted: false },
      "matched"
    ],
    [
      { refundAccepted: false, reroutingAccepted: false, replacementTravelAccepted: true },
      "excluded"
    ],
    [
      { refundAccepted: false, reroutingAccepted: false, replacementTravelAccepted: null },
      "missing"
    ]
  ] as const)("maps EU/UK accepted alternatives to %s", (assistance, status) => {
    const remedy = remedyFor("eu_uk_air_disruption", "eu_uk_refund_or_rerouting", {
      assistance
    });
    const allConditions = [
      ...remedy.matchedConditions,
      ...remedy.missingConditions,
      ...remedy.exclusions
    ];

    expect(allConditions).toContainEqual(
      expect.objectContaining({ id: "alternative_accepted", status })
    );
  });

  it("supports voluntary negotiation while excluding involuntary compensation", () => {
    const negotiation = remedyFor("us_denied_boarding", "voluntary_bump_offer", {
      deniedBoardingKind: "voluntary"
    });
    const compensation = remedyFor("us_denied_boarding", "denied_boarding_compensation", {
      deniedBoardingKind: "voluntary"
    });

    expect(conditionIds(negotiation, "matchedConditions")).toContain("voluntary_boarding");
    expect(conditionIds(compensation, "exclusions")).toContain("involuntary_boarding");
  });

  it("treats a known zero replacement delay as an admission match", () => {
    const compensation = remedyFor("us_denied_boarding", "denied_boarding_compensation", {
      replacementArrivalDelayMinutes: 0
    });

    expect(conditionIds(compensation, "matchedConditions")).toContain("replacement_arrival_delay");
  });

  it("keeps cancellation fixed compensation conditional without inventing timing rules", () => {
    const fixed = remedyFor("eu_uk_air_disruption", "eu_uk_fixed_compensation", {
      incidentType: "airline_cancellation",
      cancellationNoticeHours: 1,
      finalArrivalDelayMinutes: null,
      assistance: { replacementTravelOffered: false, replacementTravelAccepted: false }
    });

    expect(conditionIds(fixed, "missingConditions")).toContain("cancellation_notice");
    expect(conditionIds(fixed, "matchedConditions")).toContain("alternative_accepted");
    expect(fixed.exclusions).toEqual([]);
  });

  it("uses the published resolved active set and preserves dual EU/UK plus US order", () => {
    const dual = resolveClaimContext({
      state: claimState({
        incidentType: "airline_cancellation",
        origin: { airport: "CDG" },
        destination: { airport: "JFK" },
        operatingCarrier: "Air France",
        userInitiatedChange: false,
        assistance: {
          refundAccepted: false,
          reroutingAccepted: false,
          replacementTravelAccepted: false
        },
        reasonCategory: "crew"
      })
    });

    expect(evaluateScenarioConditions(dual).map(({ scenarioId }) => scenarioId)).toEqual([
      "eu_uk_air_disruption",
      "us_airline_disruption"
    ]);
  });

  it("returns no partial evaluator output for needs-information or out-of-scope contexts", () => {
    const needsInformation = resolveClaimContext({
      state: claimState({
        incidentType: "airline_cancellation",
        origin: { airport: "JFK" },
        destination: { airport: "CDG" },
        operatingCarrier: "Mystery Air"
      })
    });
    const outOfScope = resolveClaimContext({
      state: claimState({
        incidentType: "hotel_walk",
        provider: "Hyatt",
        confirmedHotelReservation: true,
        wasWalked: true
      })
    });

    expect(needsInformation.scenarios.status).toBe("needs_information");
    expect(needsInformation.scenarios.decisions).toContainEqual(
      expect.objectContaining({ scenarioId: "us_airline_disruption", status: "active" })
    );
    expect(evaluateScenarioConditions(needsInformation)).toEqual([]);
    expect(evaluateScenarioConditions(outOfScope)).toEqual([]);
  });

  it("masks a persisted two-turn boarding conflict from both boarding predicates", () => {
    const turnOne = mergeRawFacts({
      prior: claimState(
        scenarioFacts("us_denied_boarding", { deniedBoardingKind: "voluntary" }),
        6
      ),
      deterministicPatch: { set: { deniedBoardingKind: "voluntary" } },
      openaiPatch: { set: { deniedBoardingKind: "involuntary" } },
      baseRevision: 6
    });
    const turnTwo = mergeRawFacts({
      prior: JSON.parse(JSON.stringify(turnOne.state)) as typeof turnOne.state,
      deterministicPatch: { set: { provider: "American Airlines" } },
      baseRevision: 7
    });
    const context = resolveClaimContext({ state: turnTwo.state });
    const evaluation = evaluatorFor("us_denied_boarding").evaluateConditions(context);
    const negotiation = evaluation.remedies.find(
      ({ remedyId }) => remedyId === "voluntary_bump_offer"
    );
    const compensation = evaluation.remedies.find(
      ({ remedyId }) => remedyId === "denied_boarding_compensation"
    );

    expect(context.raw.facts.deniedBoardingKind).toBe("voluntary");
    expect(context.resolutionFacts.deniedBoardingKind).toBeNull();
    expect(negotiation?.missingConditions).toContainEqual(
      expect.objectContaining({ id: "voluntary_boarding", status: "missing" })
    );
    expect(compensation?.missingConditions).toContainEqual(
      expect.objectContaining({ id: "involuntary_boarding", status: "missing" })
    );
    expect(compensation?.matchedConditions.map(({ id }) => id)).not.toContain(
      "involuntary_boarding"
    );
  });

  it("defines the frozen condition catalog and emits no carrier commitment condition", () => {
    expect(CONDITION_IDS).toEqual({
      marriott: [
        "confirmed_hotel_reservation",
        "reservation_not_honored",
        "qualifying_reservation",
        "membership_attached",
        "qualifying_booking_channel",
        "replacement_lodging_missing"
      ],
      usDisruption: [
        "us_route",
        "delay_or_cancellation",
        "traveler_did_not_initiate",
        "refund_alternative_declined",
        "controllable_disruption",
        "overnight_disruption",
        "matching_carrier_commitment"
      ],
      usDeniedBoarding: [
        "us_departure",
        "oversales",
        "confirmed_reservation",
        "timely_check_in",
        "timely_gate",
        "documents_compliant",
        "voluntary_boarding",
        "involuntary_boarding",
        "replacement_arrival_delay"
      ],
      euUkDisruption: [
        "qualifying_route_and_carrier",
        "delay_or_cancellation",
        "care_delay_threshold",
        "five_hour_delay",
        "three_hour_arrival_delay",
        "cancellation_notice",
        "alternative_accepted",
        "extraordinary_circumstances"
      ]
    });

    const evaluations = (Object.keys(scenarioDefaults) as ScenarioId[]).map((scenario) =>
      evaluatorFor(scenario).evaluateConditions(contextFor(scenario))
    );
    const remedies = evaluations.flatMap(({ remedies: items }) => items);
    const conditions = remedies.flatMap((remedy) => [
      ...remedy.matchedConditions,
      ...remedy.missingConditions,
      ...remedy.exclusions
    ]);

    expect(remedies).toHaveLength(14);
    expect(remedies.every(({ material }) => material)).toBe(true);
    expect(conditions.map(({ id }) => id)).not.toContain("matching_carrier_commitment");
    conditions.forEach(({ factFields }) => {
      expect(factFields.length).toBeGreaterThan(0);
      expect(factFields.every((path) => RAW_FACT_PATHS.includes(path))).toBe(true);
    });
  });
});
