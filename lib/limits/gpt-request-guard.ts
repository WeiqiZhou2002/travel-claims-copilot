import type { ConcurrencyLease, ConcurrencyLimiter } from "./concurrency-limiter";
import type { RateLimiter } from "./rate-limiter";

export type TrustedClientIdentity = {
  key: string;
  source: "verified_host_metadata" | "local_test";
  globallyEnforceable: boolean;
};
export interface TrustedClientIdentityResolver {
  resolve(request: Request): TrustedClientIdentity;
}
export interface BudgetGate {
  check(): Promise<{ allowed: boolean; reason?: "application_budget" | "global_limit_unverified" }>;
}
export type GptGuardResult =
  | { allowed: true; lease: ConcurrencyLease }
  | {
      allowed: false;
      code: "gpt_access_denied" | "rate_limited" | "concurrency_limited" | "budget_restricted";
    };

export function createLocalTrustedIdentityResolver(
  opaqueKey = "local-runtime"
): TrustedClientIdentityResolver {
  return { resolve: () => ({ key: opaqueKey, source: "local_test", globallyEnforceable: false }) };
}

export async function guardGptRequest(input: {
  consent: boolean;
  accessGranted: boolean;
  identity: TrustedClientIdentity;
  rateLimiter: RateLimiter;
  concurrencyLimiter: ConcurrencyLimiter;
  budget: BudgetGate;
}): Promise<GptGuardResult> {
  if (!input.consent) return { allowed: false, code: "gpt_access_denied" };
  if (!input.accessGranted) {
    try {
      const failed = await input.rateLimiter.consume({
        key: input.identity.key,
        scope: "failed_access",
        limit: 10,
        windowMs: 60_000
      });
      return failed.allowed
        ? { allowed: false, code: "gpt_access_denied" }
        : { allowed: false, code: "rate_limited" };
    } catch {
      return { allowed: false, code: "budget_restricted" };
    }
  }
  let budget;
  try {
    budget = await input.budget.check();
  } catch {
    return { allowed: false, code: "budget_restricted" };
  }
  if (!budget.allowed) return { allowed: false, code: "budget_restricted" };
  try {
    const minute = await input.rateLimiter.consume({
      key: input.identity.key,
      scope: "gpt_minute",
      limit: 10,
      windowMs: 60_000
    });
    if (!minute.allowed) return { allowed: false, code: "rate_limited" };
    const hour = await input.rateLimiter.consume({
      key: input.identity.key,
      scope: "gpt_hour",
      limit: 60,
      windowMs: 3_600_000
    });
    if (!hour.allowed) return { allowed: false, code: "rate_limited" };
    const lease = await input.concurrencyLimiter.acquire(input.identity.key, 2);
    return lease ? { allowed: true, lease } : { allowed: false, code: "concurrency_limited" };
  } catch {
    return { allowed: false, code: "budget_restricted" };
  }
}
