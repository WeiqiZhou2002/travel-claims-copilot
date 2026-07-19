export type ModelFailureCode =
  | "model_refusal"
  | "model_timeout"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "invalid_model_json"
  | "invalid_model_schema";

export class ModelFailure extends Error {
  constructor(
    readonly code: ModelFailureCode,
    readonly retryable: boolean,
    readonly safeFallbackEligible: boolean
  ) {
    super(code);
    this.name = "ModelFailure";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyModelFailure(error: unknown): ModelFailure | undefined {
  if (error instanceof ModelFailure) return error;
  if (isRecord(error) && error.name === "AbortError") {
    return new ModelFailure("model_timeout", true, true);
  }
  if (!isRecord(error) || typeof error.status !== "number") return undefined;
  if (error.status === 429) {
    return new ModelFailure("upstream_rate_limited", true, true);
  }
  if (error.status >= 500 && error.status <= 599) {
    return new ModelFailure("upstream_unavailable", true, true);
  }
  return undefined;
}
