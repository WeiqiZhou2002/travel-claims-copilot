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
  "us_departure",
  "oversales",
  "confirmed_reservation",
  "timely_check_in",
  "timely_gate",
  "documents_compliant",
  "voluntary_boarding",
  "involuntary_boarding",
  "replacement_arrival_delay"
] as const satisfies readonly ConditionId[];

const labels: Record<(typeof conditionIds)[number], string> = {
  us_departure: "US departure",
  oversales: "Oversales",
  confirmed_reservation: "Confirmed reservation",
  timely_check_in: "Timely check-in",
  timely_gate: "Timely arrival at the gate",
  documents_compliant: "Required travel documents",
  voluntary_boarding: "Voluntary denied boarding",
  involuntary_boarding: "Involuntary denied boarding",
  replacement_arrival_delay: "Known replacement arrival delay"
};

function condition(
  id: (typeof conditionIds)[number],
  status: ConditionResult["status"],
  factFields: RawFactPath[]
): ConditionResult {
  return { id, label: labels[id], status, factFields };
}

function requiredBoolean(
  id: (typeof conditionIds)[number],
  value: boolean | null,
  path: RawFactPath
): ConditionResult {
  let status: ConditionResult["status"] = "missing";
  if (value === true) status = "matched";
  if (value === false) status = "excluded";
  return condition(id, status, [path]);
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

export const usDeniedBoardingEvaluator: ScenarioEvaluator = {
  scenarioId: "us_denied_boarding",
  evaluateConditions(context) {
    const facts = context.resolutionFacts;
    const usDeparture = () => {
      let status: ConditionResult["status"] = "excluded";
      if (context.jurisdiction.originRegion.value === null) status = "missing";
      if (context.jurisdiction.originRegion.value === "US") status = "matched";
      return condition(
        "us_departure",
        status,
        locationResolutionFactFields("origin", facts.origin)
      );
    };
    const oversales = () =>
      requiredBoolean("oversales", facts.oversalesConfirmed, "oversalesConfirmed");
    const voluntary = () => {
      let status: ConditionResult["status"] = "missing";
      if (facts.deniedBoardingKind === "voluntary") status = "matched";
      if (facts.deniedBoardingKind === "involuntary") status = "excluded";
      return condition("voluntary_boarding", status, ["deniedBoardingKind"]);
    };
    const involuntary = () => {
      let status: ConditionResult["status"] = "missing";
      if (facts.deniedBoardingKind === "involuntary") status = "matched";
      if (facts.deniedBoardingKind === "voluntary") status = "excluded";
      return condition("involuntary_boarding", status, ["deniedBoardingKind"]);
    };
    const confirmed = () =>
      requiredBoolean("confirmed_reservation", facts.confirmedReservation, "confirmedReservation");
    const checkedIn = () =>
      requiredBoolean("timely_check_in", facts.checkedInOnTime, "checkedInOnTime");
    const atGate = () => requiredBoolean("timely_gate", facts.atGateOnTime, "atGateOnTime");
    const documents = () =>
      requiredBoolean("documents_compliant", facts.documentsCompliant, "documentsCompliant");
    const replacementDelay = () =>
      condition(
        "replacement_arrival_delay",
        facts.replacementArrivalDelayMinutes === null ? "missing" : "matched",
        ["replacementArrivalDelayMinutes"]
      );

    return {
      scenarioId: this.scenarioId,
      remedies: [
        remedy("voluntary_bump_offer", [usDeparture(), voluntary()]),
        remedy("denied_boarding_written_rights", [usDeparture(), oversales(), involuntary()]),
        remedy("denied_boarding_compensation", [
          usDeparture(),
          oversales(),
          involuntary(),
          confirmed(),
          checkedIn(),
          atGate(),
          documents(),
          replacementDelay()
        ])
      ]
    };
  }
};
