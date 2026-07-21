import { INPUT_LIMITS } from "./api/input-limits";
import { ModelFailure } from "./model/model-error";

export function assertStructuredOutputTokenLimit(maxOutputTokens: number): void {
  if (maxOutputTokens !== INPUT_LIMITS.modelOutputTokens) {
    throw new Error("invalid_model_output_token_limit");
  }
}

export function parseStructuredOutputText<T>(text: string | undefined): T {
  if (!text) {
    throw new ModelFailure("invalid_model_schema", true, true);
  }
  if (new TextEncoder().encode(text).byteLength > INPUT_LIMITS.modelOutputBytes) {
    throw new ModelFailure("invalid_model_schema", true, true);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ModelFailure("invalid_model_json", true, true);
  }
}
