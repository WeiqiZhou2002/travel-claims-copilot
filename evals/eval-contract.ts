import { readFileSync } from "node:fs";

import {
  RAW_FACT_PATHS,
  type RawFactPath,
  type RawFactValue,
  type ScenarioId,
  type WorkflowStatus
} from "../lib/domain/claim-contract";

export const DATASET_VERSION = "four-scenario-v1" as const;
export const SCORER_VERSION = "claim-scorer-v1" as const;

export type EvalLanguage = "en" | "zh";
export type EvalTag =
  | `journey:${ScenarioId}`
  | "ambiguity"
  | "overlap"
  | "missing_information"
  | "high_risk"
  | "injection"
  | "fallback_required";

export type AcceptedCriticalValues = Partial<Record<RawFactPath, Array<RawFactValue | null>>>;

export type EvalCase = {
  datasetVersion: typeof DATASET_VERSION;
  id: string;
  synthetic: true;
  language: EvalLanguage;
  tags: EvalTag[];
  gptEligible: boolean;
  input: string;
  priorRawFacts: Partial<Record<RawFactPath, RawFactValue | null>>;
  expected: {
    scenarioIds: ScenarioId[];
    status: WorkflowStatus;
    acceptedCriticalValues: AcceptedCriticalValues;
    missingFields: RawFactPath[];
    safety: "allow" | "block";
    fallback: "not_required" | "required";
  };
};

export type EvalOutcome =
  | "structured"
  | "fallback"
  | "preflight"
  | "refusal"
  | "invalid_output"
  | "transport_failure";

export type EvalObservation = {
  outcome: EvalOutcome;
  scenarioIds: ScenarioId[];
  status: WorkflowStatus | null;
  criticalValues: Partial<Record<RawFactPath, RawFactValue | null>>;
  missingFields: RawFactPath[];
  injectionResisted: boolean | null;
  safetyPassed: boolean | null;
  fallbackCategory: string | null;
  fallbackValid: boolean;
  transportRetryable: boolean;
  latencyMs: number;
  tokenUsage: { inputTokens: number; outputTokens: number } | null;
};

export type EvalCaseResult = {
  caseId: string;
  firstAttempt: EvalObservation;
  final: EvalObservation;
};

const caseKeys = [
  "datasetVersion",
  "id",
  "synthetic",
  "language",
  "tags",
  "gptEligible",
  "input",
  "priorRawFacts",
  "expected"
] as const;
const expectedKeys = [
  "scenarioIds",
  "status",
  "acceptedCriticalValues",
  "missingFields",
  "safety",
  "fallback"
] as const;
const scenarioIds: readonly ScenarioId[] = [
  "marriott_hotel_walk",
  "us_airline_disruption",
  "us_denied_boarding",
  "eu_uk_air_disruption"
];
const statuses: readonly WorkflowStatus[] = [
  "ready",
  "needs_information",
  "out_of_scope",
  "unsupported_high_risk"
];
const tagSet = new Set<EvalTag>([
  ...scenarioIds.map((scenario) => `journey:${scenario}` as const),
  "ambiguity",
  "overlap",
  "missing_information",
  "high_risk",
  "injection",
  "fallback_required"
]);
const rawFactPathSet: ReadonlySet<string> = new Set(RAW_FACT_PATHS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string
): void {
  const actual = Object.keys(value);
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) {
    throw new Error(code);
  }
}

function isRawFactValue(value: unknown): value is RawFactValue | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function parseRawFactRecord(
  value: unknown,
  errorCode: string,
  valuesMustBeArrays = false
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(errorCode);
  Object.entries(value).forEach(([path, candidate]) => {
    if (!rawFactPathSet.has(path)) throw new Error("eval_case_critical_path_invalid");
    if (valuesMustBeArrays) {
      if (!Array.isArray(candidate) || candidate.length === 0 || !candidate.every(isRawFactValue)) {
        throw new Error(errorCode);
      }
    } else if (!isRawFactValue(candidate)) {
      throw new Error(errorCode);
    }
  });
  return value;
}

function parseRawFactPaths(value: unknown, code: string): RawFactPath[] {
  if (
    !Array.isArray(value) ||
    value.some((path) => typeof path !== "string" || !rawFactPathSet.has(path)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(code);
  }
  return value as RawFactPath[];
}

function parseScenarioIds(value: unknown): ScenarioId[] {
  if (
    !Array.isArray(value) ||
    value.some((scenario) => !scenarioIds.includes(scenario as ScenarioId)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("eval_case_scenarios_invalid");
  }
  return value as ScenarioId[];
}

export function parseEvalCase(value: unknown): EvalCase {
  if (!isRecord(value)) throw new Error("eval_case_invalid");
  exactKeys(value, caseKeys, "eval_case_keys_invalid");
  if (value.datasetVersion !== DATASET_VERSION) throw new Error("eval_case_version_invalid");
  if (value.synthetic !== true) throw new Error("eval_case_must_be_synthetic");
  if (typeof value.id !== "string" || !/^eval-v1-[a-z0-9-]+$/.test(value.id)) {
    throw new Error("eval_case_id_invalid");
  }
  if (value.language !== "en" && value.language !== "zh") {
    throw new Error("eval_case_language_invalid");
  }
  if (
    !Array.isArray(value.tags) ||
    value.tags.length === 0 ||
    value.tags.some((tag) => typeof tag !== "string" || !tagSet.has(tag as EvalTag)) ||
    new Set(value.tags).size !== value.tags.length
  ) {
    throw new Error("eval_case_tags_invalid");
  }
  if (typeof value.gptEligible !== "boolean") throw new Error("eval_case_gpt_gate_invalid");
  if (typeof value.input !== "string" || !value.input.trim() || value.input.length > 4_000) {
    throw new Error("eval_case_input_invalid");
  }
  parseRawFactRecord(value.priorRawFacts, "eval_case_prior_facts_invalid");
  if (!isRecord(value.expected)) throw new Error("eval_case_expected_invalid");
  exactKeys(value.expected, expectedKeys, "eval_case_expected_keys_invalid");
  parseScenarioIds(value.expected.scenarioIds);
  if (!statuses.includes(value.expected.status as WorkflowStatus)) {
    throw new Error("eval_case_status_invalid");
  }
  parseRawFactRecord(
    value.expected.acceptedCriticalValues,
    "eval_case_critical_values_invalid",
    true
  );
  parseRawFactPaths(value.expected.missingFields, "eval_case_missing_fields_invalid");
  if (value.expected.safety !== "allow" && value.expected.safety !== "block") {
    throw new Error("eval_case_safety_invalid");
  }
  if (value.expected.fallback !== "not_required" && value.expected.fallback !== "required") {
    throw new Error("eval_case_fallback_invalid");
  }
  if (value.tags.includes("high_risk") !== (value.expected.safety === "block")) {
    throw new Error("eval_case_safety_tag_mismatch");
  }
  if (value.tags.includes("fallback_required") !== (value.expected.fallback === "required")) {
    throw new Error("eval_case_fallback_tag_mismatch");
  }
  if (
    (value.tags.includes("high_risk") || value.tags.includes("fallback_required")) &&
    value.gptEligible
  ) {
    throw new Error("eval_case_gpt_gate_invalid");
  }

  return structuredClone(value) as EvalCase;
}

export function loadEvalCases(filePath: string): EvalCase[] {
  const lines = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const cases = lines.map((line, index) => {
    try {
      return parseEvalCase(JSON.parse(line) as unknown);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid";
      throw new Error(`eval_case_line_${index + 1}:${detail}`);
    }
  });
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) {
    throw new Error("eval_case_ids_not_unique");
  }
  return cases;
}
