import type {
  Case,
  LegalRegime,
  Policy,
  PolicyRouteRegion,
  RetrievalMatchReason,
  Script
} from "../types";

export const CANONICAL_INCIDENTS = [
  "hotel_walk",
  "airline_delay",
  "airline_cancellation",
  "denied_boarding"
] as const;

export type CanonicalIncident = (typeof CANONICAL_INCIDENTS)[number];
export type LegacyIncidentAlias =
  | "controllable_airline_delay"
  | "controllable_airline_cancellation"
  | "eu261_delay_or_cancellation";
export type ScenarioId =
  | "marriott_hotel_walk"
  | "us_airline_disruption"
  | "us_denied_boarding"
  | "eu_uk_air_disruption";
export type WorkflowStatus =
  | "ready"
  | "needs_information"
  | "out_of_scope"
  | "unsupported_high_risk";
export type ExtractionMode = "gpt" | "local";
export type ExtractionProvider = "openai" | "local";
export type RemedyStatus = "supported" | "conditional" | "not_applicable";

export type RawLocation = {
  city: string | null;
  airport: string | null;
  country: string | null;
};

export type AssistanceFacts = {
  refundOffered: boolean | null;
  refundAccepted: boolean | null;
  creditOffered: boolean | null;
  creditAccepted: boolean | null;
  reroutingOffered: boolean | null;
  reroutingAccepted: boolean | null;
  replacementTravelOffered: boolean | null;
  replacementTravelAccepted: boolean | null;
  lodgingOffered: boolean | null;
  lodgingAccepted: boolean | null;
  mealsOffered: boolean | null;
  mealsAccepted: boolean | null;
  groundTransportOffered: boolean | null;
  groundTransportAccepted: boolean | null;
};

export type RawClaimFacts = {
  incidentType: CanonicalIncident | null;
  providerType: "hotel" | "airline" | null;
  provider: string | null;
  brandOrProperty: string | null;
  operatingCarrier: string | null;
  origin: RawLocation;
  destination: RawLocation;
  statedReason: string | null;
  reasonCategory:
    | "crew"
    | "mechanical"
    | "oversales"
    | "weather"
    | "late_inbound_aircraft"
    | "other_controllable"
    | "other_uncontrollable"
    | null;
  userInitiatedChange: boolean | null;
  scheduledFinalArrival: string | null;
  actualFinalArrival: string | null;
  finalArrivalDelayMinutes: number | null;
  isOvernight: boolean | null;
  cancellationNoticeHours: number | null;
  assistance: AssistanceFacts;
  deniedBoardingKind: "voluntary" | "involuntary" | null;
  oversalesConfirmed: boolean | null;
  confirmedReservation: boolean | null;
  checkedInOnTime: boolean | null;
  atGateOnTime: boolean | null;
  documentsCompliant: boolean | null;
  replacementArrivalDelayMinutes: number | null;
  confirmedHotelReservation: boolean | null;
  qualifyingHotelReservation: boolean | null;
  bookingChannel: "direct" | "ota" | "portal" | null;
  loyaltyStatus: string | null;
  membershipAttached: boolean | null;
  wasWalked: boolean | null;
  replacementLodgingProvided: boolean | null;
  expenses: string[];
  evidence: string[];
  userGoal: string | null;
};

export const RAW_FACT_PATHS = [
  "incidentType",
  "providerType",
  "provider",
  "brandOrProperty",
  "operatingCarrier",
  "origin.city",
  "origin.airport",
  "origin.country",
  "destination.city",
  "destination.airport",
  "destination.country",
  "statedReason",
  "reasonCategory",
  "userInitiatedChange",
  "scheduledFinalArrival",
  "actualFinalArrival",
  "finalArrivalDelayMinutes",
  "isOvernight",
  "cancellationNoticeHours",
  "assistance.refundOffered",
  "assistance.refundAccepted",
  "assistance.creditOffered",
  "assistance.creditAccepted",
  "assistance.reroutingOffered",
  "assistance.reroutingAccepted",
  "assistance.replacementTravelOffered",
  "assistance.replacementTravelAccepted",
  "assistance.lodgingOffered",
  "assistance.lodgingAccepted",
  "assistance.mealsOffered",
  "assistance.mealsAccepted",
  "assistance.groundTransportOffered",
  "assistance.groundTransportAccepted",
  "deniedBoardingKind",
  "oversalesConfirmed",
  "confirmedReservation",
  "checkedInOnTime",
  "atGateOnTime",
  "documentsCompliant",
  "replacementArrivalDelayMinutes",
  "confirmedHotelReservation",
  "qualifyingHotelReservation",
  "bookingChannel",
  "loyaltyStatus",
  "membershipAttached",
  "wasWalked",
  "replacementLodgingProvided",
  "expenses",
  "evidence",
  "userGoal"
] as const;

export type RawFactPath = (typeof RAW_FACT_PATHS)[number];
export type RawFactValue = string | number | boolean | string[];
export type FactSource =
  | "user_correction"
  | "user_message"
  | "deterministic_extraction"
  | "openai_extraction";
export type FactProvenance = { source: FactSource; factsRevision: number };
export type FactConflict = {
  field: RawFactPath;
  candidates: Array<{
    value: RawFactValue;
    source: "deterministic_extraction" | "openai_extraction";
  }>;
};
export type ClaimState = {
  facts: RawClaimFacts;
  provenance: Partial<Record<RawFactPath, FactProvenance>>;
  revision: number;
  conflicts: FactConflict[];
  unresolvedFields: RawFactPath[];
};

export type RawFactPatch = {
  set: Partial<Record<RawFactPath, RawFactValue | null>>;
};

export type UserFactEdit = {
  set: Partial<Record<RawFactPath, RawFactValue>>;
  clear: RawFactPath[];
};

export type MergeRawFactsInput = {
  prior: ClaimState;
  baseRevision: number;
  correction?: UserFactEdit;
  deterministicPatch: RawFactPatch;
  openaiPatch?: RawFactPatch;
};

export type MergeRawFactsResult = {
  state: ClaimState;
  baseRevision: number;
  changedFields: RawFactPath[];
  conflicts: FactConflict[];
  unresolvedFields: RawFactPath[];
};

export type ResolvedValue<T> = {
  value: T;
  source:
    | "provider_registry"
    | "airport_registry"
    | "country_rule"
    | "carrier_registry"
    | "reason_rule"
    | "scenario_rule"
    | "insufficient_facts";
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

export type DerivedApplicability = "applies" | "does_not_apply" | "unknown";
export type ResolvedJurisdiction = {
  originRegion: ResolvedValue<PolicyRouteRegion | null>;
  destinationRegion: ResolvedValue<PolicyRouteRegion | null>;
  operatingCarrierRegion: ResolvedValue<PolicyRouteRegion | null>;
  eu261: ResolvedValue<DerivedApplicability>;
  uk261: ResolvedValue<DerivedApplicability>;
};

export type ScenarioDecision = {
  scenarioId: ScenarioId;
  status: "active" | "excluded" | "unresolved";
  reasons: string[];
  missingFacts: RawFactPath[];
};

export type ScenarioResolution =
  | {
      status: "resolved";
      scenarioIds: ScenarioId[];
      primaryScenario: ScenarioId;
      decisions: ScenarioDecision[];
      missingFacts: [];
    }
  | {
      status: "needs_information" | "out_of_scope";
      scenarioIds: [];
      primaryScenario: null;
      decisions: ScenarioDecision[];
      missingFacts: RawFactPath[];
    };

export type ResolvedClaimContext = {
  raw: ClaimState;
  resolutionFacts: RawClaimFacts;
  normalizedProvider: ResolvedValue<string | null>;
  normalizedOperatingCarrier: ResolvedValue<string | null>;
  jurisdiction: ResolvedJurisdiction;
  controllability: ResolvedValue<"controllable" | "uncontrollable" | "unknown">;
  scenarios: ScenarioResolution;
};

export type RemedyId =
  | "hotel_relocation"
  | "hotel_transport"
  | "hotel_guarantee_compensation"
  | "us_refund"
  | "us_rerouting"
  | "us_meal"
  | "us_hotel"
  | "us_ground_transport"
  | "voluntary_bump_offer"
  | "denied_boarding_written_rights"
  | "denied_boarding_compensation"
  | "eu_uk_care"
  | "eu_uk_refund_or_rerouting"
  | "eu_uk_fixed_compensation";

export const CONDITION_IDS = {
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
} as const;

export type ConditionId = (typeof CONDITION_IDS)[keyof typeof CONDITION_IDS][number];

export type ConditionResult = {
  id: ConditionId;
  label: string;
  status: "matched" | "missing" | "excluded";
  factFields: RawFactPath[];
};

export type RemedyConditionEvaluation = {
  remedyId: RemedyId;
  material: boolean;
  matchedConditions: ConditionResult[];
  missingConditions: ConditionResult[];
  exclusions: ConditionResult[];
};

export type ProviderCommitmentEvidence = {
  commitmentId: string;
  normalizedCarrier: string;
  applicableCarrierRole: "operating_carrier";
  sourceUrl: string;
  sourceTitle: string;
  sourceProvider: string;
  sourceType: "official_dashboard" | "official_policy";
  legalRegime: "US_AIRLINE_COMMITMENT";
  authority: "medium";
  sourceLastChecked: string;
  conditions: string[];
  rights: string[];
};

export type RequestOption = {
  tone: "conservative" | "standard" | "assertive";
  remedyId: RemedyId;
  remedyStatus: RemedyStatus;
  text: string;
  sourceIds: string[];
};

export type RemedyAssessment = {
  remedyId: RemedyId;
  scenarioId: ScenarioId;
  title: string;
  material: boolean;
  status: RemedyStatus;
  factsUsed: RawFactPath[];
  matchedConditions: ConditionResult[];
  missingConditions: ConditionResult[];
  exclusions: ConditionResult[];
  sourceIds: string[];
  providerCommitment?: ProviderCommitmentEvidence;
  evidence: {
    status: "complete" | "partial" | "missing";
    held: string[];
    missing: string[];
  };
  requestOptions: RequestOption[];
  cautions: string[];
  nextAction: string;
};

export type RankedDisplayItem<T> = {
  item: T;
  reasons: RetrievalMatchReason[];
  score: number;
};

export type PolicyApplicability = {
  policy: Policy;
  status: "applicable" | "conditional" | "not_applicable";
  matchedConditions: string[];
  missingConditions: string[];
  exclusions: string[];
  applicableCarrier: string | null;
};

export type RetrievalTrace = {
  policyApplicability: PolicyApplicability[];
  displayedPolicies: RankedDisplayItem<Policy>[];
  displayedCases: RankedDisplayItem<Case>[];
  displayedScripts: RankedDisplayItem<Script>[];
};

export type FactDisplayItem = {
  path: RawFactPath;
  label: string;
  value: RawFactValue | null;
  provenance: FactProvenance | null;
};

export type ExtractionMetadata =
  | {
      performed: false;
      requestedMode: ExtractionMode;
      provider: null;
      model: null;
      notRunReason: "preflight_guard" | "correction_only";
    }
  | {
      performed: true;
      requestedMode: "gpt";
      provider: "openai";
      model: "gpt-5.6-luna";
    }
  | {
      performed: true;
      requestedMode: "local";
      provider: "local";
      model: null;
    }
  | {
      performed: true;
      requestedMode: "gpt";
      provider: "local";
      model: null;
      fallbackReason: string;
    };

export type AssessmentResult = {
  status: WorkflowStatus;
  primaryScenario: ScenarioId | null;
  scenarioIds: ScenarioId[];
  factsRevision: number;
  factsUsed: FactDisplayItem[];
  missingFacts: RawFactPath[];
  legalRegimes: LegalRegime[];
  extraction: ExtractionMetadata;
  assessments: RemedyAssessment[];
  retrieval: RetrievalTrace;
  cautions: string[];
  nextActions: string[];
};

export type AnalyzeClaimDomainResponse = {
  baseRevision: number;
  claimState: ClaimState;
  result: AssessmentResult;
  context: ResolvedClaimContext | null;
};

export type ScenarioConditionEvaluation = {
  scenarioId: ScenarioId;
  remedies: RemedyConditionEvaluation[];
};

export interface ScenarioEvaluator {
  readonly scenarioId: ScenarioId;
  evaluateConditions(context: ResolvedClaimContext): ScenarioConditionEvaluation;
}

export type ResolvedContextWithoutScenarios = Omit<ResolvedClaimContext, "scenarios">;

export type PublicScenarioSummary = {
  id: ScenarioId;
  label: string;
};

export const PUBLIC_SCENARIOS: readonly PublicScenarioSummary[] = [
  { id: "marriott_hotel_walk", label: "Marriott hotel walk" },
  { id: "us_airline_disruption", label: "US airline delay or cancellation" },
  { id: "us_denied_boarding", label: "US denied boarding" },
  { id: "eu_uk_air_disruption", label: "EU/UK airline delay or cancellation" }
];

export function getPublicScenarioCatalog(): readonly PublicScenarioSummary[] {
  return PUBLIC_SCENARIOS;
}
