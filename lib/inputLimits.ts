export const MAX_INTAKE_MESSAGE_LENGTH = 4_000;
export const MAX_ANALYZE_DESCRIPTION_LENGTH = 12_000;
export const MAX_REQUEST_BODY_BYTES = 64_000;
export const MAX_FACT_STRING_LENGTH = 2_000;
export const MAX_FACT_ARRAY_ITEMS = 32;

export function requestBodyExceedsLimit(request: Request): boolean {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES;
}

export async function readBoundedJson(request: Request, maxBytes = MAX_REQUEST_BODY_BYTES): Promise<
  { ok: true; value: Record<string, unknown> } | { ok: false; status: number; error: string }
> {
  if (Number(request.headers.get("content-length")) > maxBytes) return { ok: false, status: 413, error: "Request body is too large." };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "A JSON object is required." };
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = "";
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 5_000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (timedOut) return { ok: false, status: 408, error: "Request body timed out." };
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: "Request body is too large." };
      }
      json += decoder.decode(chunk.value, { stream: true });
    }
    const value: unknown = JSON.parse(json + decoder.decode());
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "A valid JSON object is required." };
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
