import type { Case } from "../types";

export type EvidenceRef = { evidence_ids: string[] };
export type Measure = EvidenceRef & {
  kind: string;
  description: string;
  amount: number | null;
  currency_or_program: string | null;
  unit: string | null;
  fulfillment: string;
};
export type DP = {
  schema_version: "0.3";
  dp_id: string;
  title?: string;
  reporter?: string;
  event: EvidenceRef & {
    description: string;
    occurred_at: { text: string; normalized: string | null; precision: string };
    provider: string | null;
    carrier: string | null;
    airline_reported: string;
    route: { origin: string | null; destination: string | null; text: string };
    issue_type: string;
    boarding_context?: string;
  };
  cause: (EvidenceRef & { description: string; attributed_to: string }) | null;
  passenger_actions:
    | (EvidenceRef & {
        action_id: string;
        order: number;
        time_text: string | null;
        description: string;
        channel: string | null;
      })[]
    | null;
  airline_handling: {
    initial_status: string;
    final_status: string;
    responses: (EvidenceRef & {
      response_id: string;
      order: number;
      time_text: string | null;
      phase: string;
      description: string;
      after_action_id: string | null;
      measures: Measure[];
    })[];
  };
  sources: {
    source_id: string;
    url: string | null;
    forum: string;
    post_locator: string;
    posted_at: string | null;
    observed_at: string;
    reading_scope: string;
    limitation?: string;
    access_method?: string;
  }[];
  evidence: {
    evidence_id: string;
    source_id: string;
    locator: string;
    excerpt: string | null;
    supports: string[];
    note?: string;
  }[];
  review: {
    record_status: string;
    workflow_status: string;
    review_status: string;
    missing_required: string[];
    missing_optional: string[];
    conflicts: {
      field?: string;
      severity?: string;
      detail: string;
      evidence_ids?: string[];
    }[];
    duplicate_of: string | null;
    rationale: string;
    notes?: string[];
    verification?: string;
  };
};
export type ReviewStatus =
  | "pending"
  | "approved"
  | "needs_evidence"
  | "excluded";
export type ReviewAction =
  | "save"
  | "approve"
  | "request_evidence"
  | "exclude"
  | "revoke";
export type Principal = { id: string; role: "reviewer" | "collector" };
export type AuditEntry = {
  version: number;
  action: ReviewAction | "import";
  actor: string;
  at: string;
  note: string;
  sourceChecked: boolean;
  snapshot: DP;
};
export type ReviewRecord = {
  id: string;
  batchId: string;
  version: number;
  status: ReviewStatus;
  original: DP;
  current: DP;
  history: AuditEntry[];
  publication: Case | null;
};
export type ReviewState = { schemaVersion: 1; records: ReviewRecord[] };
export type ReviewCommand = {
  action: ReviewAction;
  expectedVersion: number;
  dp?: DP;
  note: string;
  sourceChecked?: boolean;
};
// The transaction must commit the draft, audit and publication together. A database
// adapter can use a transaction with a row lock; clients never address filesystem paths.
export interface ReviewRepository {
  read(): Promise<ReviewState>;
  transact<T>(work: (state: ReviewState) => T): Promise<T>;
}
export class ReviewError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
