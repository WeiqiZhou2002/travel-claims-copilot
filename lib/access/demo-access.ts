import { createHash, timingSafeEqual } from "node:crypto";

export function verifyDemoAccess(input: {
  consent: boolean;
  suppliedCode: string | null | undefined;
  configuredCode: string | null | undefined;
}): boolean {
  if (!input.consent || !input.suppliedCode || !input.configuredCode) return false;
  const supplied = createHash("sha256").update(input.suppliedCode, "utf8").digest();
  const configured = createHash("sha256").update(input.configuredCode, "utf8").digest();
  return timingSafeEqual(supplied, configured);
}
