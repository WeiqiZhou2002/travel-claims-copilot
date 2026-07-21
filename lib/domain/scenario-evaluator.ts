import type {
  ResolvedClaimContext,
  ScenarioConditionEvaluation,
  ScenarioEvaluator,
  ScenarioId
} from "./claim-contract";
import { euUkAirDisruptionEvaluator } from "./evaluators/eu-uk-air-disruption";
import { marriottHotelWalkEvaluator } from "./evaluators/marriott-hotel-walk";
import { usAirlineDisruptionEvaluator } from "./evaluators/us-airline-disruption";
import { usDeniedBoardingEvaluator } from "./evaluators/us-denied-boarding";

export {
  euUkAirDisruptionEvaluator,
  marriottHotelWalkEvaluator,
  usAirlineDisruptionEvaluator,
  usDeniedBoardingEvaluator
};

const evaluators: Record<ScenarioId, ScenarioEvaluator> = {
  marriott_hotel_walk: marriottHotelWalkEvaluator,
  us_airline_disruption: usAirlineDisruptionEvaluator,
  us_denied_boarding: usDeniedBoardingEvaluator,
  eu_uk_air_disruption: euUkAirDisruptionEvaluator
};

export function evaluatorFor(scenarioId: ScenarioId): ScenarioEvaluator {
  return evaluators[scenarioId];
}

export function evaluateScenarioConditions(
  context: ResolvedClaimContext
): ScenarioConditionEvaluation[] {
  if (context.scenarios.status !== "resolved") return [];
  return context.scenarios.scenarioIds.map((scenarioId) =>
    evaluatorFor(scenarioId).evaluateConditions(context)
  );
}
