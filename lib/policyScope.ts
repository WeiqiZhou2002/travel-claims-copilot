import type { ClaimDisruptionReason } from "./claimFacts";
import {
  isChineseOperatingCarrier,
  isEuOperatingCarrier,
  isUkOrEuOperatingCarrier
} from "./jurisdiction";
import { findProviderMatch, providersMatch } from "./provider";
import type {
  ApplicabilityStatus,
  Controllability,
  Policy,
  PolicyApplicabilityAssessment,
  PolicyConditionAssessment,
  PolicyApplicabilityRule,
  PolicyRegion,
  PolicyRouteRegion,
  RetrievalQuery
} from "./types";

const euCountries = new Set([
  "eu",
  "france",
  "germany",
  "italy",
  "spain",
  "netherlands",
  "ireland",
  "portugal",
  "belgium",
  "austria",
  "greece",
  "sweden",
  "denmark",
  "finland",
  "poland",
  "czechia",
  "norway",
  "iceland",
  "switzerland"
]);

export function controllabilityFromReason(
  reason: ClaimDisruptionReason | undefined
): Controllability {
  if (reason === "crew" || reason === "mechanical" || reason === "other_controllable") {
    return "controllable";
  }
  if (reason === "weather") {
    return "uncontrollable";
  }
  return "unknown";
}

export function policyRegionsFromCountry(country: string | undefined): PolicyRegion[] {
  const normalized = country?.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  if (euCountries.has(normalized)) {
    return ["EU_EEA_CH"];
  }
  if (normalized === "us" || normalized === "usa" || normalized === "united states") {
    return ["US"];
  }
  if (normalized === "uk" || normalized === "united kingdom") {
    return ["UK"];
  }
  if (normalized === "ca" || normalized === "canada") {
    return ["CA"];
  }
  if (normalized === "au" || normalized === "australia") {
    return ["AU"];
  }
  if (
    normalized === "cn" ||
    normalized === "china" ||
    normalized === "mainland china"
  ) {
    return ["CN"];
  }
  return ["other"];
}

type RouteScopeQuery = Pick<
  RetrievalQuery,
  | "originRegion"
  | "destinationRegion"
  | "operatingCarrier"
  | "operatingCarrierRegion"
  | "provider"
  | "policyRegions"
>;

function condition(
  code: PolicyConditionAssessment["code"],
  label: string,
  status: ApplicabilityStatus,
  detail: string,
  kind: PolicyConditionAssessment["kind"] = "scope"
): PolicyConditionAssessment {
  return { code, kind, label, status, detail };
}

function includesRouteRegion(
  applicableRegions: PolicyRegion[],
  region: PolicyRouteRegion | undefined
): boolean {
  return Boolean(region && applicableRegions.includes(region));
}

function coarseRegionMatch(
  applicableRegions: PolicyRegion[],
  query: RouteScopeQuery
): boolean {
  return (
    applicableRegions.includes("global") ||
    applicableRegions.some((region) => query.policyRegions.includes(region))
  );
}

export function applicabilityRuleMatches(
  rule: PolicyApplicabilityRule,
  applicableRegions: PolicyRegion[],
  query: RouteScopeQuery
): boolean {
  if (rule === "any_route" || rule === "listed_provider") {
    return true;
  }

  const hasExplicitRoute = Boolean(query.originRegion || query.destinationRegion);
  const originMatches = includesRouteRegion(applicableRegions, query.originRegion);
  const destinationMatches = includesRouteRegion(
    applicableRegions,
    query.destinationRegion
  );
  const carrier = query.operatingCarrier ?? query.provider;

  if (rule === "origin_region") {
    return hasExplicitRoute ? originMatches : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "origin_or_destination_region") {
    return hasExplicitRoute
      ? originMatches || destinationMatches
      : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "eu261_route") {
    if (query.originRegion === "EU_EEA_CH") {
      return true;
    }
    if (query.destinationRegion === "EU_EEA_CH") {
      return (
        query.operatingCarrierRegion === "EU_EEA_CH" || isEuOperatingCarrier(carrier)
      );
    }
    return hasExplicitRoute ? false : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "uk261_route") {
    if (query.originRegion === "UK") {
      return true;
    }
    if (query.destinationRegion === "UK") {
      return (
        query.operatingCarrierRegion === "UK" ||
        query.operatingCarrierRegion === "EU_EEA_CH" ||
        isUkOrEuOperatingCarrier(carrier)
      );
    }
    return hasExplicitRoute ? false : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "australia_consumer_law") {
    // Inbound Australian coverage can also depend on the booking channel. Keep the
    // policy as a candidate and expose that condition rather than asserting eligibility.
    return hasExplicitRoute
      ? query.originRegion === "AU" || query.destinationRegion === "AU"
      : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "china_flight_regulation") {
    if (
      query.originRegion === "CN" ||
      query.operatingCarrierRegion === "CN" ||
      isChineseOperatingCarrier(carrier)
    ) {
      return true;
    }
    return hasExplicitRoute ? false : coarseRegionMatch(applicableRegions, query);
  }

  return false;
}

export function policyAppliesToRoute(policy: Policy, query: RouteScopeQuery): boolean {
  return applicabilityRuleMatches(
    policy.applicability_rule,
    policy.applicable_regions,
    query
  );
}

function evaluateRouteScope(
  policy: Policy,
  query: RouteScopeQuery
): PolicyConditionAssessment {
  const { applicability_rule: rule, applicable_regions: regions } = policy;
  const origin = query.originRegion;
  const destination = query.destinationRegion;
  const carrier = query.operatingCarrier ?? query.provider;
  const carrierRegion =
    query.operatingCarrierRegion ??
    (carrier ? findProviderMatch(carrier, "airline")?.operatingCarrierRegion : undefined);
  const originMatches = includesRouteRegion(regions, origin);
  const destinationMatches = includesRouteRegion(regions, destination);

  if (rule === "any_route" || rule === "listed_provider") {
    return condition("route", "Route scope", "met", "This source has no route restriction.");
  }

  if (rule === "origin_region") {
    if (!origin) {
      return condition(
        "route",
        "Departure region",
        "unknown",
        "The departure region is needed to confirm this source."
      );
    }
    return condition(
      "route",
      "Departure region",
      originMatches ? "met" : "not_met",
      originMatches
        ? `The departure region ${origin} is in scope.`
        : `The departure region ${origin} is outside this source's scope.`
    );
  }

  if (rule === "origin_or_destination_region") {
    if (originMatches || destinationMatches) {
      return condition(
        "route",
        "Route region",
        "met",
        "At least one known endpoint is in the covered region."
      );
    }
    if (origin && destination) {
      return condition(
        "route",
        "Route region",
        "not_met",
        "Neither known endpoint is in the covered region."
      );
    }
    return condition(
      "route",
      "Route region",
      "unknown",
      "Both route endpoints are needed to rule this source in or out."
    );
  }

  if (rule === "eu261_route") {
    if (origin === "EU_EEA_CH") {
      return condition(
        "route",
        "EU261 route scope",
        "met",
        "The flight departs from the EU/EEA/Switzerland region."
      );
    }
    if (destination === "EU_EEA_CH") {
      if (
        carrierRegion === "EU_EEA_CH" ||
        isEuOperatingCarrier(carrier)
      ) {
        return condition(
          "route",
          "EU261 route scope",
          "met",
          "The flight arrives in the EU/EEA/Switzerland on a qualifying EU carrier."
        );
      }
      if (carrierRegion) {
        return condition(
          "route",
          "EU261 route scope",
          "not_met",
          "The inbound operating carrier is known to be outside the EU/EEA/Switzerland."
        );
      }
      return condition(
        "route",
        "EU261 route scope",
        "unknown",
        "The operating carrier is needed for an inbound EU flight."
      );
    }
    if (origin && destination) {
      return condition(
        "route",
        "EU261 route scope",
        "not_met",
        "The known route neither departs from nor arrives in the EU/EEA/Switzerland."
      );
    }
    return condition(
      "route",
      "EU261 route scope",
      "unknown",
      "Both route endpoints are needed to assess EU261 geographic scope."
    );
  }

  if (rule === "uk261_route") {
    if (origin === "UK") {
      return condition(
        "route",
        "UK261 route scope",
        "met",
        "The flight departs from the United Kingdom."
      );
    }
    if (destination === "UK") {
      if (
        carrierRegion === "UK" ||
        carrierRegion === "EU_EEA_CH" ||
        isUkOrEuOperatingCarrier(carrier)
      ) {
        return condition(
          "route",
          "UK261 route scope",
          "met",
          "The flight arrives in the UK on a qualifying UK or EU carrier."
        );
      }
      if (carrierRegion) {
        return condition(
          "route",
          "UK261 route scope",
          "not_met",
          "The inbound operating carrier is known to be outside the UK/EU scope."
        );
      }
      return condition(
        "route",
        "UK261 route scope",
        "unknown",
        "The operating carrier is needed for an inbound UK flight."
      );
    }
    if (origin && destination) {
      return condition(
        "route",
        "UK261 route scope",
        "not_met",
        "The known route neither departs from nor arrives in the United Kingdom."
      );
    }
    return condition(
      "route",
      "UK261 route scope",
      "unknown",
      "Both route endpoints are needed to assess UK261 geographic scope."
    );
  }

  if (rule === "australia_consumer_law") {
    if (origin === "AU") {
      return condition(
        "route",
        "Australian service scope",
        "met",
        "The travel service departs from Australia."
      );
    }
    if (destination === "AU") {
      return condition(
        "route",
        "Australian service scope",
        "unknown",
        "Inbound coverage can depend on where and how the service was booked."
      );
    }
    if (origin && destination) {
      return condition(
        "route",
        "Australian service scope",
        "not_met",
        "Neither known endpoint is in Australia."
      );
    }
    return condition(
      "route",
      "Australian service scope",
      "unknown",
      "Route and booking details are needed to assess Australian coverage."
    );
  }

  if (rule === "china_flight_regulation") {
    if (
      origin === "CN" ||
      carrierRegion === "CN" ||
      isChineseOperatingCarrier(carrier)
    ) {
      return condition(
        "route",
        "Mainland China service scope",
        "met",
        "The known departure or operating-carrier facts are within the regulation's scope."
      );
    }
    if (origin || destination) {
      return condition(
        "route",
        "Mainland China service scope",
        "not_met",
        "The known route and carrier facts do not place this flight within scope."
      );
    }
    return condition(
      "route",
      "Mainland China service scope",
      "unknown",
      "Departure and operating-carrier details are needed to assess this source."
    );
  }

  return condition(
    "route",
    "Route scope",
    "unknown",
    "The route rule could not be evaluated."
  );
}

function evaluateProviderScope(
  policy: Policy,
  query: RetrievalQuery
): PolicyConditionAssessment {
  if (policy.applicable_providers.length === 0) {
    return condition(
      "provider",
      "Provider scope",
      "met",
      "This source is not restricted to a listed provider."
    );
  }

  if (!query.provider) {
    return condition(
      "provider",
      "Provider scope",
      "unknown",
      "The provider is needed to confirm this provider-specific source."
    );
  }

  const matches = policy.applicable_providers.some((provider) =>
    providersMatch(provider, query.provider)
  );
  return condition(
    "provider",
    "Provider scope",
    matches ? "met" : "not_met",
    matches
      ? `${query.provider} matches the source's provider scope.`
      : `${query.provider} is outside the source's listed providers.`
  );
}

function evaluateControllability(
  policy: Policy,
  query: RetrievalQuery
): PolicyConditionAssessment {
  if (policy.required_controllability === "any") {
    return condition(
      "controllability",
      "Cause classification",
      "met",
      "This source is not limited to a controllable or uncontrollable cause."
    );
  }

  if (query.controllability === "unknown") {
    return condition(
      "controllability",
      "Cause classification",
      "unknown",
      `The cause must be confirmed as ${policy.required_controllability}.`
    );
  }

  const matches = policy.required_controllability === query.controllability;
  return condition(
    "controllability",
    "Cause classification",
    matches ? "met" : "not_met",
    matches
      ? `The reported cause is classified as ${query.controllability}.`
      : `The reported cause is ${query.controllability}, but this source requires ${policy.required_controllability}.`
  );
}

function evaluateRemedyConditions(
  policy: Policy,
  query: RetrievalQuery
): PolicyConditionAssessment[] {
  const conditions: PolicyConditionAssessment[] = [];

  if (
    (policy.legal_regime === "EU261" || policy.legal_regime === "UK261") &&
    query.issueType === "airline_delay"
  ) {
    const minutes = query.arrivalDelayMinutes;
    conditions.push(
      condition(
        "arrival_delay",
        "Fixed-compensation delay threshold",
        minutes === undefined ? "unknown" : minutes >= 180 ? "met" : "not_met",
        minutes === undefined
          ? "Final-arrival delay is needed to assess the common three-hour threshold; other rights may still apply."
          : minutes >= 180
            ? `The reported final-arrival delay is ${minutes} minutes, meeting the three-hour threshold.`
            : `The reported final-arrival delay is ${minutes} minutes, below the three-hour threshold; other rights may still apply.`,
        "remedy"
      )
    );
  }

  if (
    policy.legal_regime === "US_DOT_DENIED_BOARDING" &&
    query.issueType === "denied_boarding"
  ) {
    const kind = query.deniedBoardingKind;
    conditions.push(
      condition(
        "denied_boarding_kind",
        "Mandatory denied-boarding compensation",
        !kind || kind === "unknown"
          ? "unknown"
          : kind === "involuntary"
            ? "met"
            : "not_met",
        !kind || kind === "unknown"
          ? "Voluntary versus involuntary denied boarding must be confirmed."
          : kind === "involuntary"
            ? "The passenger reports involuntary denied boarding."
            : "The passenger reports a voluntary bump, which uses negotiated terms instead of mandatory involuntary compensation.",
        "remedy"
      )
    );
  }

  return conditions;
}

export function evaluatePolicyApplicability(
  policy: Policy,
  query: RetrievalQuery
): PolicyApplicabilityAssessment {
  const incidentMatches = policy.incident_types.some(
    (incidentType) => incidentType === query.issueType
  );
  const conditions: PolicyConditionAssessment[] = [
    condition(
      "incident",
      "Incident type",
      incidentMatches ? "met" : "not_met",
      incidentMatches
        ? `${query.issueType.replaceAll("_", " ")} is covered by this source.`
        : `${query.issueType.replaceAll("_", " ")} is outside this source's incident scope.`
    ),
    evaluateRouteScope(policy, query),
    evaluateProviderScope(policy, query),
    evaluateControllability(policy, query),
    ...evaluateRemedyConditions(policy, query)
  ];
  const scopeConditions = conditions.filter((item) => item.kind === "scope");
  const status = scopeConditions.some((item) => item.status === "not_met")
    ? "not_met"
    : scopeConditions.some((item) => item.status === "unknown")
      ? "unknown"
      : "met";

  return { policyId: policy.policy_id, status, conditions };
}
