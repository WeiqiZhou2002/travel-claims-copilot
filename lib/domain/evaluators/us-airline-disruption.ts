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
  "us_route",
  "delay_or_cancellation",
  "traveler_did_not_initiate",
  "refund_alternative_declined",
  "controllable_disruption",
  "overnight_disruption"
] as const satisfies readonly ConditionId[];

const labels: Record<(typeof conditionIds)[number], string> = {
  us_route: "US route",
  delay_or_cancellation: "Qualifying delay or cancellation",
  traveler_did_not_initiate: "Traveler did not initiate the change",
  refund_alternative_declined: "Refund or rerouting alternative declined",
  controllable_disruption: "Controllable disruption",
  overnight_disruption: "Overnight disruption"
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

export const usAirlineDisruptionEvaluator: ScenarioEvaluator = {
  scenarioId: "us_airline_disruption",
  evaluateConditions(context) {
    const facts = context.resolutionFacts;
    const route = () => {
      const origin = context.jurisdiction.originRegion.value;
      const destination = context.jurisdiction.destinationRegion.value;
      let status: ConditionResult["status"] = "excluded";
      if (origin === null || destination === null) status = "missing";
      if (origin === "US" || destination === "US") status = "matched";
      return condition("us_route", status, [
        ...locationResolutionFactFields("origin", facts.origin),
        ...locationResolutionFactFields("destination", facts.destination)
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
    const refundDisruption = () => {
      let status: ConditionResult["status"] = "excluded";
      if (facts.incidentType === null || facts.incidentType === "airline_delay") {
        status = "missing";
      }
      if (facts.incidentType === "airline_cancellation") status = "matched";
      return condition("delay_or_cancellation", status, ["incidentType"]);
    };
    const travelerDidNotInitiate = () => {
      let status: ConditionResult["status"] = "missing";
      if (facts.userInitiatedChange === false) status = "matched";
      if (facts.userInitiatedChange === true) status = "excluded";
      return condition("traveler_did_not_initiate", status, ["userInitiatedChange"]);
    };
    const refundAlternativeDeclined = () => {
      const values = [facts.assistance.refundAccepted, facts.assistance.reroutingAccepted];
      let status: ConditionResult["status"] = "missing";
      if (values.every((value) => value === false)) status = "matched";
      if (values.some((value) => value === true)) status = "excluded";
      return condition("refund_alternative_declined", status, [
        "assistance.refundAccepted",
        "assistance.reroutingAccepted"
      ]);
    };
    const reroutingDeclined = () => {
      let status: ConditionResult["status"] = "missing";
      if (facts.assistance.reroutingAccepted === false) status = "matched";
      if (facts.assistance.reroutingAccepted === true) status = "excluded";
      return condition("refund_alternative_declined", status, ["assistance.reroutingAccepted"]);
    };
    const controllable = () => {
      let status: ConditionResult["status"] = "missing";
      if (context.controllability.value === "controllable") status = "matched";
      if (context.controllability.value === "uncontrollable") status = "excluded";
      return condition("controllable_disruption", status, ["reasonCategory"]);
    };
    const overnight = () => {
      let status: ConditionResult["status"] = "missing";
      if (facts.isOvernight === true) status = "matched";
      if (facts.isOvernight === false) status = "excluded";
      return condition("overnight_disruption", status, ["isOvernight"]);
    };

    return {
      scenarioId: this.scenarioId,
      remedies: [
        remedy("us_refund", [
          route(),
          refundDisruption(),
          travelerDidNotInitiate(),
          refundAlternativeDeclined()
        ]),
        remedy("us_rerouting", [
          route(),
          disruption(),
          travelerDidNotInitiate(),
          reroutingDeclined()
        ]),
        remedy("us_meal", [route(), disruption(), controllable()]),
        remedy("us_hotel", [route(), disruption(), controllable(), overnight()]),
        remedy("us_ground_transport", [route(), disruption(), controllable(), overnight()])
      ]
    };
  }
};
