export type IssueType =
  | "hotel_walk"
  | "controllable_airline_cancellation"
  | "controllable_airline_delay"
  | "eu261_delay_or_cancellation"
  | "denied_boarding"
  | "baggage_delay"
  | "airline_delay_trip_insurance"
  | "airline_baggage_not_checked"
  | "airline_rebooking_mixed_carrier_delay"
  | "hotel_billing_dispute"
  | "hotel_service_issue"
  | "hotel_property_loss"
  | "hotel_relocation_before_opening"
  | "hotel_room_feature_mismatch"
  | "hotel_elite_benefit_closure"
  | "unknown";

export type ProviderType = "hotel" | "airline" | "credit_card" | "ota" | "government";

export type Policy = {
  policy_id: string;
  provider_type: ProviderType;
  provider: string;
  policy_name: string;
  issue_type: string;
  source_url: string;
  source_type:
    | "official_policy"
    | "government_regulation"
    | "official_dashboard"
    | "terms";
  authority_level: "high" | "medium" | "low";
  applicable_conditions: string[];
  compensation_or_rights: string[];
  summary: string;
  last_checked: string;
};

export type Case = {
  case_id: string;
  source_type: "community_dp" | "user_submitted" | "synthetic_example";
  source_name: string;
  source_url: string;
  provider_type: Exclude<ProviderType, "government">;
  provider: string;
  brand_or_airline: string;
  issue_type: string;
  location_country: string;
  booking_channel: "direct" | "ota" | "portal" | "unknown";
  loyalty_status: string;
  reservation_type: "paid" | "points" | "award" | "unknown";
  facts: string;
  requested_compensation: string[];
  actual_outcome: string;
  evidence_used: string[];
  escalation_path: string[];
  reusable_lesson: string;
  confidence: "high" | "medium" | "low";
  notes: string;
  review_status: "approved" | "needs_review" | "excluded";
  review_notes: string[];
};

export type Script = {
  script_id: string;
  issue_type: string;
  provider: string;
  channel:
    | "front_desk"
    | "airport_counter"
    | "phone"
    | "chat"
    | "email"
    | "corporate_escalation"
    | "regulator_complaint";
  tone: "polite" | "polite_firm" | "firm";
  language: "en" | "zh";
  template: string;
  when_to_use: string;
};

export type AnalyzeOptions = {
  caseId?: string;
  issueType?: IssueType;
};

export type ExtractedFacts = {
  description: string;
  issueType: IssueType;
  provider?: string;
  providerType?: ProviderType;
  caseId?: string;
  confidence: "low" | "medium" | "high";
  signals: string[];
  source: "keyword" | "selected_case" | "selected_issue" | "fallback";
};

export type RetrievalResult = {
  facts: ExtractedFacts;
  issueAliases: IssueType[];
  officialBasis: Policy[];
  similarCases: Case[];
  scripts: Script[];
  selectedCase?: Case;
};

export type SuggestedAsks = {
  conservative: string[];
  standard: string[];
  aggressive: string[];
};

export type AnalysisResult = {
  issueType: IssueType;
  strength: "low" | "medium" | "high";
  summary: string;
  officialBasis: Policy[];
  similarCases: Case[];
  suggestedAsks: SuggestedAsks;
  evidenceChecklist: string[];
  scripts: Script[];
  cautions: string[];
};

export type ScenarioSummary = {
  issueType: IssueType;
  label: string;
  caseCount: number;
  officialBasisCount: number;
  scriptCount: number;
  providers: string[];
  sampleCase?: {
    caseId: string;
    provider: string;
    brandOrAirline: string;
    facts: string;
  };
};
