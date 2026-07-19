import type {
  CarrierCommitment,
  CarrierCommitmentPredicate,
  KnowledgeSnapshot
} from "../../lib/knowledge/knowledge-contract";
import type { Policy } from "../../lib/types";

export function carrierCommitmentFixture(
  overrides: Partial<CarrierCommitment> = {}
): CarrierCommitment {
  const predicates: CarrierCommitmentPredicate[] = [
    {
      kind: "event",
      field: "incidentType",
      operator: "one_of",
      values: ["airline_delay", "airline_cancellation"]
    },
    {
      kind: "controllability",
      field: "controllability",
      operator: "equals",
      value: "controllable"
    },
    { kind: "overnight", field: "isOvernight", operator: "equals", value: true }
  ];

  return {
    commitmentId: "united_test_commitment",
    normalizedCarrier: "United",
    applicableCarrierRole: "operating_carrier",
    sourceTitle: "Reviewed United disruption commitments",
    sourceProvider: "U.S. Department of Transportation",
    sourceUrl: "https://example.test/united-commitments",
    sourceType: "official_dashboard",
    legalRegime: "US_AIRLINE_COMMITMENT",
    authority: "medium",
    lastChecked: "2026-07-18",
    reviewerNote: "Reviewed fixture record.",
    remedies: [
      {
        remedyId: "us_rerouting",
        committed: true,
        predicates: predicates.slice(0, 2),
        displayConditions: ["Controllable cancellation or delay"],
        rights: ["Rebooking at no additional cost"]
      },
      {
        remedyId: "us_meal",
        committed: true,
        predicates: [
          ...predicates.slice(0, 2),
          {
            kind: "minimum_wait_minutes",
            field: "waitMinutes",
            operator: "at_least",
            value: 180
          }
        ],
        displayConditions: ["Controllable disruption after a 180-minute wait"],
        rights: ["Meal or meal voucher"]
      },
      {
        remedyId: "us_hotel",
        committed: true,
        predicates,
        displayConditions: ["Controllable overnight disruption"],
        rights: ["Complimentary hotel accommodation"]
      },
      {
        remedyId: "us_ground_transport",
        committed: true,
        predicates,
        displayConditions: ["Hotel transportation for an overnight disruption"],
        rights: ["Transportation to and from the hotel"]
      }
    ],
    ...overrides
  };
}

export function policyFixture(overrides: Partial<Policy> = {}): Policy {
  return {
    policy_id: "policy_fixture",
    provider_type: "government",
    provider: "Fixture regulator",
    policy_name: "Fixture policy",
    legal_regime: "US_DOT_REFUND",
    applicability_rule: "any_route",
    incident_types: ["airline_delay", "airline_cancellation"],
    applicable_regions: ["global"],
    applicable_providers: [],
    required_controllability: "any",
    source_url: "https://example.test/policy",
    source_type: "regulator_guidance",
    authority_level: "high",
    applicable_conditions: [],
    compensation_or_rights: ["Fixture right"],
    summary: "Fixture policy summary.",
    last_checked: "2026-07-18",
    ...overrides
  };
}

export function knowledgeSnapshotFixture(
  overrides: Partial<KnowledgeSnapshot> = {}
): KnowledgeSnapshot {
  return {
    policies: [],
    cases: [],
    scripts: [],
    carrierCommitments: [],
    version: "fixture-v1",
    ...overrides
  };
}
