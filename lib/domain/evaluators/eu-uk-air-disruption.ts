import type {
  ConditionId,
  ConditionResult,
  RawFactPath,
  RemedyConditionEvaluation,
  RemedyId,
  ScenarioEvaluator
} from "../claim-contract";
import { locationResolutionFactFields } from "../context-resolver";

const conditionIds = [
  "qualifying_route_and_carrier",
  "delay_or_cancellation",
  "care_delay_threshold",
  "five_hour_delay",
  "three_hour_arrival_delay",
  "cancellation_notice",
  "alternative_accepted",
  "extraordinary_circumstances"
] as const satisfies readonly ConditionId[];

const labels: Record<(typeof conditionIds)[number], string> = {
  qualifying_route_and_carrier: "Qualifying route and operating carrier",
  delay_or_cancellation: "Delay or cancellation",
  care_delay_threshold: "Care delay threshold",
  five_hour_delay: "Five-hour delay threshold",
  three_hour_arrival_delay: "Three-hour final-arrival delay",
  cancellation_notice: "Qualifying cancellation notice",
  alternative_accepted: "No accepted alternative",
  extraordinary_circumstances: "No extraordinary circumstance"
};

function condition(
  id: (typeof conditionIds)[number],
  status: ConditionResult["status"],
  factFields: RawFactPath[]
): ConditionResult {
  return { id, label: labels[id], status, factFields };
}

function remedy(remedyId: RemedyId, conditions: ConditionResult[]): RemedyConditionEvaluation {
  return {
    remedyId,
    material: true,
    matchedConditions: conditions.filter(({ status }) => status === "matched"),
    missingConditions: conditions.filter(({ status }) => status === "missing"),
    exclusions: conditions.filter(({ status }) => status === "excluded")
  };
}

export const euUkAirDisruptionEvaluator: ScenarioEvaluator = {
  scenarioId: "eu_uk_air_disruption",
  evaluateConditions(context) {
    const facts = context.resolutionFacts;
    const qualifyingScope = () => {
      const applicability = [context.jurisdiction.eu261.value, context.jurisdiction.uk261.value];
      let status: ConditionResult["status"] = "excluded";
      if (applicability.includes("unknown")) status = "missing";
      if (applicability.includes("applies")) status = "matched";
      const carrierWasConsumed = [context.jurisdiction.eu261, context.jurisdiction.uk261].some(
        ({ reasons }) =>
          reasons.some((reason) =>
            [
              "eu_eea_ch_arrival_carrier",
              "uk_arrival_carrier",
              "operating_carrier_region_unknown",
              "inbound_carrier_excluded"
            ].includes(reason)
          )
      );
      return condition("qualifying_route_and_carrier", status, [
        ...locationResolutionFactFields("origin", facts.origin),
        ...locationResolutionFactFields("destination", facts.destination),
        ...(carrierWasConsumed ? (["operatingCarrier"] as RawFactPath[]) : [])
      ]);
    };
    const disruption = () => {
      let status: ConditionResult["status"] = "excluded";
      if (facts.incidentType === null) status = "missing";
      if (facts.incidentType === "airline_delay" || facts.incidentType === "airline_cancellation") {
        status = "matched";
      }
      return condition("delay_or_cancellation", status, ["incidentType"]);
    };
    const careThreshold = () => {
      if (facts.incidentType === "airline_cancellation") {
        return condition("care_delay_threshold", "matched", ["incidentType"]);
      }
      const minutes = facts.finalArrivalDelayMinutes;
      let status: ConditionResult["status"] = "missing";
      if (minutes !== null && minutes < 120) status = "excluded";
      if (minutes !== null && minutes >= 240) status = "matched";
      return condition("care_delay_threshold", status, [
        "incidentType",
        "finalArrivalDelayMinutes"
      ]);
    };
    const fiveHourThreshold = () => {
      if (facts.incidentType === "airline_cancellation") {
        return condition("five_hour_delay", "matched", ["incidentType"]);
      }
      const minutes = facts.finalArrivalDelayMinutes;
      let status: ConditionResult["status"] = "missing";
      if (minutes !== null && minutes < 300) status = "excluded";
      if (minutes !== null && minutes >= 300) status = "matched";
      return condition("five_hour_delay", status, ["incidentType", "finalArrivalDelayMinutes"]);
    };
    const acceptedAlternative = () => {
      const values = [
        facts.assistance.refundAccepted,
        facts.assistance.reroutingAccepted,
        facts.assistance.replacementTravelAccepted
      ];
      let status: ConditionResult["status"] = "missing";
      if (values.every((value) => value === false)) status = "matched";
      if (values.some((value) => value === true)) status = "excluded";
      return condition("alternative_accepted", status, [
        "assistance.refundAccepted",
        "assistance.reroutingAccepted",
        "assistance.replacementTravelAccepted"
      ]);
    };
    const threeHourThreshold = () => {
      const minutes = facts.finalArrivalDelayMinutes;
      let status: ConditionResult["status"] = "missing";
      if (minutes !== null && minutes < 180) status = "excluded";
      if (minutes !== null && minutes >= 180) status = "matched";
      return condition("three_hour_arrival_delay", status, [
        "incidentType",
        "finalArrivalDelayMinutes"
      ]);
    };
    const cancellationNotice = () => condition("cancellation_notice", "missing", []);
    const cancellationAlternative = () =>
      condition(
        "alternative_accepted",
        facts.assistance.replacementTravelOffered === false ? "matched" : "missing",
        ["assistance.replacementTravelOffered"]
      );
    const noExtraordinaryCircumstance = () => {
      let status: ConditionResult["status"] = "missing";
      if (context.controllability.value === "controllable") status = "matched";
      if (context.controllability.value === "uncontrollable") status = "excluded";
      return condition("extraordinary_circumstances", status, ["reasonCategory"]);
    };
    const fixedTimingConditions =
      facts.incidentType === "airline_cancellation"
        ? [cancellationNotice(), cancellationAlternative()]
        : [threeHourThreshold()];

    return {
      scenarioId: this.scenarioId,
      remedies: [
        remedy("eu_uk_care", [qualifyingScope(), disruption(), careThreshold()]),
        remedy("eu_uk_refund_or_rerouting", [
          qualifyingScope(),
          disruption(),
          fiveHourThreshold(),
          acceptedAlternative()
        ]),
        remedy("eu_uk_fixed_compensation", [
          qualifyingScope(),
          disruption(),
          ...fixedTimingConditions,
          noExtraordinaryCircumstance()
        ])
      ]
    };
  }
};
