export type ApiFaultCode =
  | "unsupported_media_type"
  | "invalid_json"
  | "request_too_large"
  | "unprocessable_request";

export class ApiFault extends Error {
  readonly code: ApiFaultCode;

  readonly status: 400 | 413 | 415 | 422;

  readonly retryable: boolean;

  constructor(code: ApiFaultCode, status: 400 | 413 | 415 | 422, retryable = false) {
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
