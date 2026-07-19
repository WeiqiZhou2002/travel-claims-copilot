import type { ApiErrorCode } from "./api-response";

export type ApiFaultCode = Extract<
  ApiErrorCode,
  "unsupported_media_type" | "invalid_json" | "request_too_large" | "unprocessable_request"
>;

type ApiFaultStatus = 400 | 413 | 415 | 422;

export class ApiFault extends Error {
  readonly code: ApiFaultCode;

  readonly status: ApiFaultStatus;

  readonly retryable: boolean;

  constructor(code: ApiFaultCode, status: ApiFaultStatus, retryable = false) {
    super(code);
    this.name = "ApiFault";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function isApiFault(value: unknown): value is ApiFault {
  return value instanceof ApiFault;
}
