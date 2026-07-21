import { parseAnalyzeRequest } from "./analyze-contract";
import { ApiFault } from "./api-error";
import { INPUT_LIMITS } from "./input-limits";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isClaimStateReplayable(state: unknown): boolean {
  try {
    if (!isRecord(state)) return false;
    const candidate = { message: "x", prior: state, baseRevision: state.revision };
    const serialized = JSON.stringify(candidate);
    if (
      typeof serialized !== "string" ||
      new TextEncoder().encode(serialized).byteLength > INPUT_LIMITS.bodyBytes
    ) {
      return false;
    }
    return parseAnalyzeRequest(JSON.parse(serialized) as unknown).success;
  } catch {
    return false;
  }
}

export function hasJsonMediaType(request: Request): boolean {
  return /^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "");
}

export async function readJsonBody(request: Request): Promise<unknown> {
  if (!hasJsonMediaType(request)) {
    throw new ApiFault("unsupported_media_type", 415, false);
  }
  if (!request.body) {
    throw new ApiFault("invalid_json", 400, false);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- stream chunks must be consumed sequentially
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > INPUT_LIMITS.bodyBytes) {
      // eslint-disable-next-line no-await-in-loop -- the 413 response must wait for cancellation
      await reader.cancel().catch(() => undefined);
      throw new ApiFault("request_too_large", 413, false);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiFault("invalid_json", 400, false);
  }
}
