import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  const contents = await readFile(resolve(projectRoot, relativePath), "utf8");
  const value = JSON.parse(contents);

  if (!Array.isArray(value)) {
    throw new Error(`${relativePath} must contain a top-level array.`);
  }

  return value;
}

function requireFields(record, fields, label) {
  for (const field of fields) {
    if (!(field in record)) {
      throw new Error(`${label} is missing required field ${field}.`);
    }
  }
}

function requireUnique(records, field, label) {
  const seen = new Set();

  for (const record of records) {
    const value = record[field];
    if (seen.has(value)) {
      throw new Error(`${label} has duplicate ${field}: ${value}`);
    }
    seen.add(value);
  }
}

function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} has invalid value: ${String(value)}`);
  }
}

const mvpIncidentTypes = [
  "hotel_walk",
  "airline_delay",
  "airline_cancellation",
  "denied_boarding",
];
const legacyLegalIssueTypes = [
  "controllable_airline_delay",
  "controllable_airline_cancellation",
  "eu261_delay_or_cancellation",
];
const policyRegions = [
  "EU_EEA_CH",
  "UK",
  "US",
  "CA",
  "AU",
  "CN",
  "other",
  "global",
];
const legalRegimes = [
  "provider_policy",
  "EU261",
  "UK261",
  "US_DOT_REFUND",
  "US_DOT_DENIED_BOARDING",
  "US_AIRLINE_COMMITMENT",
  "CA_APPR",
  "AU_ACL",
  "CN_FLIGHT_REGULATION",
];
const policyApplicabilityRules = [
  "any_route",
  "listed_provider",
  "origin_region",
  "origin_or_destination_region",
  "eu261_route",
  "uk261_route",
  "australia_consumer_law",
  "china_flight_regulation",
];

const [cases, policies, scripts] = await Promise.all([
  readJson("data/cases.json"),
  readJson("data/policies.json"),
  readJson("data/scripts.json"),
]);
const release = JSON.parse(
  await readFile(resolve(projectRoot, "data/reviewed-cases.json"), "utf8"),
);
if (
  release.schemaVersion !== 1 ||
  !Array.isArray(release.cases) ||
  !Array.isArray(release.managedIds) ||
  new Set(release.managedIds).size !== release.managedIds.length ||
  release.managedIds.some(
    (id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,140}$/.test(id),
  )
)
  throw new Error("Invalid reviewed release manifest");
for (const item of release.cases) {
  if (
    item.review_status !== "approved" ||
    item.source_type !== "community_dp" ||
    !Number.isInteger(item.reviewed_version) ||
    item.reviewed_version < 2 ||
    !release.managedIds.includes(item.case_id)
  )
    throw new Error("Invalid reviewed publication");
}
if (cases.some((item) => release.managedIds.includes(item.case_id)))
  throw new Error("Published DP conflicts with seed ID");
cases.push(...release.cases);

const caseFields = [
  "case_id",
  "source_type",
  "source_name",
  "source_url",
  "provider_type",
  "provider",
  "carrier",
  "brand_or_airline",
  "issue_type",
  "location_country",
  "booking_channel",
  "loyalty_status",
  "reservation_type",
  "facts",
  "requested_compensation",
  "actual_outcome",
  "evidence_used",
  "escalation_path",
  "reusable_lesson",
  "confidence",
  "notes",
  "review_status",
  "review_notes",
];

requireUnique(cases, "case_id", "cases.json");

const communityUrls = new Set();
for (const item of cases) {
  const label = `case ${item.case_id ?? "<unknown>"}`;
  requireFields(item, caseFields, label);
  for (const field of ["provider", "carrier"]) {
    if (
      item[field] !== null &&
      (typeof item[field] !== "string" || !item[field].trim())
    ) {
      throw new Error(`${label}.${field} must be a non-empty string or null.`);
    }
  }
  if (item.provider_type !== "airline" && item.carrier !== null) {
    throw new Error(`${label}.carrier is only valid for airline cases.`);
  }
  requireEnum(
    item.source_type,
    ["community_dp", "user_submitted", "synthetic_example"],
    label,
  );
  requireEnum(
    item.provider_type,
    ["hotel", "airline", "credit_card", "ota"],
    label,
  );
  requireEnum(
    item.booking_channel,
    ["direct", "ota", "portal", "unknown"],
    label,
  );
  requireEnum(
    item.reservation_type,
    ["paid", "points", "award", "unknown"],
    label,
  );
  requireEnum(item.confidence, ["high", "medium", "low"], label);
  requireEnum(
    item.review_status,
    ["approved", "needs_review", "excluded"],
    label,
  );
  if (legacyLegalIssueTypes.includes(item.issue_type)) {
    throw new Error(
      `${label}.issue_type must describe the incident, not a legal regime.`,
    );
  }

  for (const field of [
    "requested_compensation",
    "evidence_used",
    "escalation_path",
    "review_notes",
  ]) {
    if (!Array.isArray(item[field])) {
      throw new Error(`${label}.${field} must be an array.`);
    }
  }

  if (item.source_type === "community_dp") {
    if (!item.source_url.startsWith("https://")) {
      throw new Error(`${label} must have an HTTPS source URL.`);
    }
    if (communityUrls.has(item.source_url)) {
      throw new Error(
        `${label} duplicates community source URL ${item.source_url}.`,
      );
    }
    communityUrls.add(item.source_url);
  }

  if (item.review_status !== "approved" && item.review_notes.length === 0) {
    throw new Error(`${label} must explain why it is not approved.`);
  }

  if (item.review_status === "approved" && item.issue_type === "unknown") {
    throw new Error(`${label} cannot be approved with an unknown issue type.`);
  }
}

requireUnique(policies, "policy_id", "policies.json");
for (const policy of policies) {
  requireFields(
    policy,
    [
      "policy_id",
      "provider_type",
      "provider",
      "policy_name",
      "legal_regime",
      "applicability_rule",
      "incident_types",
      "applicable_regions",
      "applicable_providers",
      "required_controllability",
      "source_url",
      "source_type",
      "authority_level",
      "applicable_conditions",
      "compensation_or_rights",
      "summary",
      "last_checked",
    ],
    `policy ${policy.policy_id ?? "<unknown>"}`,
  );
  const label = `policy ${policy.policy_id ?? "<unknown>"}`;
  for (const field of [
    "incident_types",
    "applicable_regions",
    "applicable_providers",
  ]) {
    if (!Array.isArray(policy[field])) {
      throw new Error(`${label}.${field} must be an array.`);
    }
  }
  for (const incidentType of policy.incident_types) {
    requireEnum(incidentType, mvpIncidentTypes, label);
  }
  for (const region of policy.applicable_regions) {
    requireEnum(region, policyRegions, label);
  }
  requireEnum(policy.legal_regime, legalRegimes, label);
  requireEnum(policy.applicability_rule, policyApplicabilityRules, label);
  requireEnum(
    policy.source_type,
    [
      "official_policy",
      "government_regulation",
      "regulator_guidance",
      "official_dashboard",
      "terms",
    ],
    label,
  );
  requireEnum(policy.authority_level, ["high", "medium", "low"], label);
  if (!policy.source_url.startsWith("https://")) {
    throw new Error(`${label}.source_url must be an HTTPS URL.`);
  }
  requireEnum(
    policy.required_controllability,
    ["controllable", "uncontrollable", "unknown", "any"],
    label,
  );
}

requireUnique(scripts, "script_id", "scripts.json");
for (const script of scripts) {
  const label = `script ${script.script_id ?? "<unknown>"}`;
  requireFields(
    script,
    [
      "script_id",
      "incident_types",
      "applicable_regions",
      "applicability_rule",
      "required_controllability",
      "provider",
      "channel",
      "tone",
      "language",
      "template",
      "when_to_use",
    ],
    label,
  );
  for (const field of ["incident_types", "applicable_regions"]) {
    if (!Array.isArray(script[field])) {
      throw new Error(`${label}.${field} must be an array.`);
    }
  }
  for (const incidentType of script.incident_types) {
    requireEnum(incidentType, mvpIncidentTypes, label);
  }
  for (const region of script.applicable_regions) {
    requireEnum(region, policyRegions, label);
  }
  requireEnum(script.applicability_rule, policyApplicabilityRules, label);
  requireEnum(
    script.required_controllability,
    ["controllable", "uncontrollable", "unknown", "any"],
    label,
  );
  requireEnum(
    script.channel,
    [
      "front_desk",
      "airport_counter",
      "phone",
      "chat",
      "email",
      "corporate_escalation",
      "regulator_complaint",
    ],
    label,
  );
}

const statusCounts = Object.fromEntries(
  ["approved", "needs_review", "excluded"].map((status) => [
    status,
    cases.filter((item) => item.review_status === status).length,
  ]),
);

console.log(
  `Validated ${policies.length} policies, ${cases.length} cases (${Object.entries(
    statusCounts,
  )
    .map(([status, count]) => `${count} ${status}`)
    .join(", ")}), and ${scripts.length} scripts.`,
);
