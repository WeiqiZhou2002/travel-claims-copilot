export type IssueType =
  | "hotel_walk"
  | "controllable_airline_cancellation"
  | "controllable_airline_delay"
  | "eu261_delay_or_cancellation"
  | "unknown";

export type Policy = {
  policy_id: string;
  provider_type: "hotel" | "airline" | "credit_card" | "ota" | "government";
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
  provider_type: "hotel" | "airline" | "credit_card" | "ota";
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
};

export type Script = {
  script_id: string;
  issue_type: string;
  provider: string;
  channel:
    | "front_desk"
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

export type SuggestedAsks = {
  conservative: string[];
  standard: string[];
  aggressive: string[];
};

export type AnalysisResult = {
  issueType: IssueType;
  strength: "low" | "medium" | "high";
  officialBasis: Policy[];
  similarCases: Case[];
  suggestedAsks: SuggestedAsks;
  evidenceChecklist: string[];
  scripts: Script[];
  cautions: string[];
};
