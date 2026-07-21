import type {
  ConditionId,
  ConditionResult,
  RawFactPath,
  RemedyConditionEvaluation,
  RemedyId,
  ScenarioEvaluator
} from "../claim-contract";

const labels: Record<(typeof conditionIds)[number], string> = {
  confirmed_hotel_reservation: "Confirmed hotel reservation",
  reservation_not_honored: "Reservation was not honored",
  qualifying_reservation: "Qualifying reservation",
  membership_attached: "Membership attached to reservation",
  qualifying_booking_channel: "Qualifying booking channel",
  replacement_lodging_missing: "Replacement lodging not already provided"
};

const conditionIds = [
  "confirmed_hotel_reservation",
  "reservation_not_honored",
  "qualifying_reservation",
  "membership_attached",
  "qualifying_booking_channel",
  "replacement_lodging_missing"
] as const satisfies readonly ConditionId[];

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

export const marriottHotelWalkEvaluator: ScenarioEvaluator = {
  scenarioId: "marriott_hotel_walk",
  evaluateConditions(context) {
    const facts = context.resolutionFacts;
    const confirmed = () =>
      requiredBoolean(
        "confirmed_hotel_reservation",
        facts.confirmedHotelReservation,
        "confirmedHotelReservation"
      );
    const walked = () => requiredBoolean("reservation_not_honored", facts.wasWalked, "wasWalked");
    const qualifying = () =>
      requiredBoolean(
        "qualifying_reservation",
        facts.qualifyingHotelReservation,
        "qualifyingHotelReservation"
      );
    const membership = () =>
      requiredBoolean("membership_attached", facts.membershipAttached, "membershipAttached");
    const bookingChannel = () => {
      let status: ConditionResult["status"] = "missing";
      if (facts.bookingChannel === "direct" || facts.bookingChannel === "portal") {
        status = "matched";
      }
      if (facts.bookingChannel === "ota") status = "excluded";
      return condition("qualifying_booking_channel", status, ["bookingChannel"]);
    };
    const replacementLodging = () => {
      let status: ConditionResult["status"] = "missing";
      if (facts.replacementLodgingProvided === false) status = "matched";
      if (facts.replacementLodgingProvided === true) status = "excluded";
      return condition("replacement_lodging_missing", status, ["replacementLodgingProvided"]);
    };

    return {
      scenarioId: this.scenarioId,
      remedies: [
        remedy("hotel_relocation", [confirmed(), walked()]),
        remedy("hotel_transport", [confirmed(), walked(), replacementLodging()]),
        remedy("hotel_guarantee_compensation", [
          confirmed(),
          qualifying(),
          walked(),
          membership(),
          bookingChannel()
        ])
      ]
    };
  }
};
