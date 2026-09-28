import type { AnalysisResult } from "../../lib/types";
export const issueLabels: Partial<Record<AnalysisResult["issueType"], string>> = {
  hotel_walk: "Hotel walk",
  airline_cancellation: "Airline cancellation",
  airline_delay: "Airline delay",
  denied_boarding: "Denied boarding or voluntary bump",
  baggage_delay: "Baggage delay",
  airline_delay_trip_insurance: "Airline delay and trip insurance",
  airline_baggage_not_checked: "Baggage not accepted at check-in",
  airline_rebooking_mixed_carrier_delay: "Mixed-carrier rebooking delay",
  hotel_billing_dispute: "Hotel billing dispute",
  hotel_service_issue: "Hotel service issue",
  hotel_property_loss: "Hotel property loss",
  hotel_relocation_before_opening: "Hotel relocation before opening",
  hotel_room_feature_mismatch: "Hotel room feature mismatch",
  hotel_elite_benefit_closure: "Hotel elite benefit closure",
  unknown: "Needs more detail"
};

export const evidenceCoverageStyles: Record<
  AnalysisResult["evidenceCoverage"]["officialBasisStatus"],
  string
> = {
  scope_confirmed: "bg-mint text-white",
  conditional: "bg-coral text-white",
  not_found: "bg-ink text-white"
};

