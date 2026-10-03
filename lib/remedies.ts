import { passengerSideCompensationExplanation } from "./policyScope";
import type { LegalRegime, RemedyDecision, RetrievalResult, SuggestedAsks } from "./types";

// Scope establishes candidate sources, not entitlement. Unimplemented source
// conditions remain explicit verification requirements rather than passing silently.
export function assessRemedies(retrieval: RetrievalResult): RemedyDecision[] {
  const q = retrieval.query;
  const completed = q.journeyStage === "completed";
  const sources = (...regimes: LegalRegime[]) =>
    retrieval.officialBasis
      .filter((policy) => regimes.includes(policy.legal_regime))
      .map((policy) => policy.policy_id);
  const decisions: RemedyDecision[] = [];
  const add = (
    id: RemedyDecision["id"],
    title: string,
    ids: string[],
    excluded: boolean,
    explanation: string,
    request: string
  ) => {
    decisions.push({
      id,
      title,
      sourceIds: ids,
      status:
        excluded || (ids.length === 0 && id !== "goodwill" && id !== "voluntary_offer")
          ? "not_supported"
          : "needs_verification",
      explanation:
        !excluded && ids.length === 0 && id !== "goodwill" && id !== "voluntary_offer"
          ? "No matching official basis in the reviewed local data. This is not a finding that no rights exist."
          : explanation,
      request
    });
  };
  if (q.issueType !== "unknown") {
    const transport = sources(
      "US_DOT_REFUND",
      "EU261",
      "UK261",
      "CA_APPR",
      "AU_ACL",
      "CN_FLIGHT_REGULATION"
    );
    add(
      "refund",
      "Unused-ticket refund",
      transport,
      completed || q.acceptedAlternative === true,
      completed || q.acceptedAlternative === true
        ? "Completed travel or an accepted alternative does not support this unused-ticket refund request. Other unused segments require a separate review."
        : "Verify cancellation or a qualifying change, unused travel, and whether any alternative transportation, credit or voucher was accepted. Automatic rebooking is not acceptance.",
      "Ask for a refund eligibility review of unused travel, after confirming the disruption and any accepted alternatives."
    );
    add(
      "rebooking",
      "Replacement travel",
      [...transport, ...sources("US_AIRLINE_COMMITMENT")],
      completed,
      completed
        ? "This disrupted journey is already complete."
        : "Confirm the responsible carrier or ticket issuer, available replacement and ticket restrictions.",
      "Ask the responsible provider to confirm replacement travel options and ticket validity."
    );
    add(
      "care",
      "Meals, lodging and transport",
      sources("EU261", "UK261", "CA_APPR", "US_AIRLINE_COMMITMENT", "CN_FLIGHT_REGULATION"),
      false,
      "Verify the specific carrier commitment or regulation, cause, waiting time, overnight need and reasonable expenses. Different care benefits have different conditions.",
      "Ask which meal, hotel and transport support applies to this disruption, or request review of documented eligible expenses."
    );
    const compensationSources = sources("EU261", "UK261", "US_DOT_DENIED_BOARDING", "CA_APPR");
    const voluntary = q.issueType === "denied_boarding" && q.deniedBoardingKind === "voluntary";
    const shortEuDelay =
      q.issueType === "airline_delay" &&
      q.arrivalDelayMinutes !== undefined &&
      q.arrivalDelayMinutes < 180 &&
      compensationSources.every((id) => /eu261|uk261/.test(id));
    add(
      "fixed_compensation",
      "Compensation eligibility",
      compensationSources,
      q.disruptionReason === "passenger_side" || voluntary || shortEuDelay,
      q.disruptionReason === "passenger_side"
        ? passengerSideCompensationExplanation
        : voluntary
          ? "A voluntary offer is negotiated separately from mandatory involuntary-denial compensation."
          : shortEuDelay
            ? "The reported arrival delay is below the evaluated EU/UK delay threshold; care remains a separate question."
            : "Eligibility remains unconfirmed: check arrival timing, cause and exceptions, cancellation notice, or oversales and check-in requirements as applicable. No amount is determined.",
      "Request an assessment of compensation only after confirming every applicable eligibility condition and exception."
    );
    if (voluntary)
      add(
        "voluntary_offer",
        "Voluntary offer terms",
        sources("US_DOT_DENIED_BOARDING"),
        false,
        "Confirm the negotiated offer, restrictions and replacement itinerary; no payout is guaranteed.",
        "Ask for the voluntary offer, restrictions and confirmed replacement itinerary in writing."
      );
  }
  add(
    "goodwill",
    "Optional goodwill request",
    [],
    false,
    "Discretionary and not a legal or contractual entitlement.",
    "If appropriate, request discretionary goodwill based on documented inconvenience, without claiming an entitlement."
  );
  return decisions;
}

export function asksFromRemedies(decisions: RemedyDecision[]): SuggestedAsks {
  return {
    conservative: [
      "Ask for the written disruption reason, available immediate assistance, and a case number."
    ],
    standard: decisions
      .filter((item) => item.status === "needs_verification" && item.id !== "goodwill")
      .map((item) => item.request),
    aggressive: [
      "Follow up with the written facts and supporting evidence; verify the applicable complaint channel before escalating.",
      ...decisions.filter((item) => item.id === "goodwill").map((item) => item.request)
    ]
  };
}
