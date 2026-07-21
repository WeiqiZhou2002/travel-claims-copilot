import { createLocalTrustedIdentityResolver, type BudgetGate } from "../limits/gpt-request-guard";
import { MemoryConcurrencyLimiter } from "../limits/concurrency-limiter";
import { MemoryRateLimiter } from "../limits/rate-limiter";

export const runtimeGptControls = {
  rateLimiter: new MemoryRateLimiter(),
  concurrencyLimiter: new MemoryConcurrencyLimiter(),
  identityResolver: createLocalTrustedIdentityResolver(),
  budget: {
    async check() {
      return { allowed: true };
    }
  } satisfies BudgetGate
};
