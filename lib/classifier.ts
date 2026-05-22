import { normalizeIssueType } from "./issueTaxonomy";
import type { AnalyzeOptions, ExtractedFacts, IssueType, ProviderType } from "./types";

type MatchResult = {
  issueType: IssueType;
  provider?: string;
  providerType?: ProviderType;
  signals: string[];
};

function hasAny(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

function buildFacts(
  description: string,
  issueType: IssueType,
  source: ExtractedFacts["source"],
  signals: string[],
  options: AnalyzeOptions,
  provider?: string,
  providerType?: ProviderType
): ExtractedFacts {
  return {
    description,
    issueType,
    provider,
    providerType,
    caseId: options.caseId,
    confidence: issueType === "unknown" ? "low" : source === "fallback" ? "medium" : "high",
    signals,
    source
  };
}

function matchIssue(description: string): MatchResult {
  const text = description.toLowerCase();

  const deniedBoardingSignals = hasAny(text, [
    "denied boarding",
    "involuntary",
    "voluntary bump",
    "bump",
    "gate agent"
  ]);
  if (deniedBoardingSignals.length > 0) {
    return {
      issueType: "denied_boarding",
      providerType: "airline",
      signals: deniedBoardingSignals
    };
  }

  const euSignals = hasAny(text, ["eu261", "europe", "european union", " eu "]);
  if (/\beu\b/.test(text)) {
    euSignals.push("eu");
  }
  const longDelaySignals = hasAny(text, [
    "delayed 3 hours",
    "delay 3 hours",
    "3 hour delay",
    "three hour delay"
  ]);
  const disruptionSignals = hasAny(text, [
    "delay",
    "delayed",
    "cancellation",
    "cancelled",
    "canceled"
  ]);
  if ((euSignals.length > 0 && disruptionSignals.length > 0) || longDelaySignals.length > 0) {
    return {
      issueType: "eu261_delay_or_cancellation",
      providerType: "airline",
      signals: [...euSignals, ...disruptionSignals, ...longDelaySignals]
    };
  }

  const tripInsuranceSignals = hasAny(text, [
    "trip delay insurance",
    "amex",
    "card insurance",
    "travel protection"
  ]);
  if (tripInsuranceSignals.length > 0) {
    return {
      issueType: "airline_delay_trip_insurance",
      providerType: "airline",
      signals: tripInsuranceSignals
    };
  }

  const baggageSignals = hasAny(text, [
    "baggage",
    "luggage",
    "bag",
    "gate-check",
    "gate check",
    "checked bag"
  ]);
  if (baggageSignals.length > 0) {
    const notCheckedSignals = hasAny(text, [
      "not checked",
      "could not check",
      "didn't check",
      "did not check",
      "check-in"
    ]);

    return {
      issueType:
        notCheckedSignals.length > 0 ? "airline_baggage_not_checked" : "baggage_delay",
      providerType: "airline",
      signals: [...baggageSignals, ...notCheckedSignals]
    };
  }

  const mixedCarrierSignals = hasAny(text, [
    "cathay",
    "cx",
    "mixed carrier",
    "operating carrier",
    "chase travel"
  ]);
  if (mixedCarrierSignals.length > 0) {
    return {
      issueType: "airline_rebooking_mixed_carrier_delay",
      providerType: "airline",
      signals: mixedCarrierSignals
    };
  }

  const airlineSignals = hasAny(text, [
    "united",
    "airline",
    "crew",
    "cancellation",
    "cancelled",
    "canceled",
    "delay",
    "overnight"
  ]);
  if (airlineSignals.length > 0) {
    const cancellationSignals = hasAny(text, ["cancellation", "cancelled", "canceled"]);

    return {
      issueType:
        cancellationSignals.length > 0
          ? "controllable_airline_cancellation"
          : "controllable_airline_delay",
      provider: text.includes("united") ? "United" : undefined,
      providerType: "airline",
      signals: airlineSignals
    };
  }

  const relocationSignals = hasAny(text, [
    "relocate",
    "relocation",
    "opening",
    "not open",
    "delayed opening"
  ]);
  if (relocationSignals.length > 0) {
    return {
      issueType: "hotel_relocation_before_opening",
      providerType: "hotel",
      signals: relocationSignals
    };
  }

  const billingSignals = hasAny(text, [
    "billing",
    "deposit",
    "folio",
    "security deposit",
    "incorrect charge"
  ]);
  if (billingSignals.length > 0) {
    return {
      issueType: "hotel_billing_dispute",
      providerType: "hotel",
      signals: billingSignals
    };
  }

  const propertyLossSignals = hasAny(text, [
    "lost item",
    "housekeeping",
    "towel",
    "personal item"
  ]);
  if (propertyLossSignals.length > 0) {
    return {
      issueType: "hotel_property_loss",
      providerType: "hotel",
      signals: propertyLossSignals
    };
  }

  const eliteBenefitSignals = hasAny(text, [
    "club closed",
    "lounge closed",
    "regency club",
    "breakfast benefit",
    "club access"
  ]);
  if (eliteBenefitSignals.length > 0) {
    return {
      issueType: "hotel_elite_benefit_closure",
      providerType: "hotel",
      signals: eliteBenefitSignals
    };
  }

  const roomFeatureSignals = hasAny(text, [
    "room feature",
    "amenity",
    "amenities",
    "suite",
    "upgrade charge",
    "broken"
  ]);
  if (roomFeatureSignals.length > 0) {
    return {
      issueType: "hotel_room_feature_mismatch",
      providerType: "hotel",
      signals: roomFeatureSignals
    };
  }

  const serviceIssueSignals = hasAny(text, ["restaurant", "qr", "undelivered", "service issue"]);
  if (serviceIssueSignals.length > 0) {
    return {
      issueType: "hotel_service_issue",
      providerType: "hotel",
      signals: serviceIssueSignals
    };
  }

  const hotelWalkSignals = hasAny(text, [
    "marriott",
    "sheraton",
    "hotel",
    "walk",
    "no room",
    "oversold"
  ]);
  if (hotelWalkSignals.length > 0) {
    return {
      issueType: "hotel_walk",
      provider: text.includes("marriott") ? "Marriott" : undefined,
      providerType: "hotel",
      signals: hotelWalkSignals
    };
  }

  return {
    issueType: "unknown",
    signals: []
  };
}

export function classifyIssue(input: string): IssueType {
  return matchIssue(input).issueType;
}

export function classifyInput(
  description: string,
  options: AnalyzeOptions = {}
): ExtractedFacts {
  const selectedIssueType = normalizeIssueType(options.issueType);

  if (options.caseId) {
    return buildFacts(description, selectedIssueType ?? "unknown", "selected_case", [], options);
  }

  if (selectedIssueType) {
    return buildFacts(description, selectedIssueType, "selected_issue", [], options);
  }

  const match = matchIssue(description);
  return buildFacts(
    description,
    match.issueType,
    match.issueType === "unknown" ? "fallback" : "keyword",
    match.signals,
    options,
    match.provider,
    match.providerType
  );
}
