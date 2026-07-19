import { describe, expect, it } from "vitest";

import { MemoryConcurrencyLimiter } from "../../lib/limits/concurrency-limiter";
import { guardGptRequest, type BudgetGate } from "../../lib/limits/gpt-request-guard";
import { MemoryRateLimiter } from "../../lib/limits/rate-limiter";

const budget: BudgetGate = {
  async check() {
    return { allowed: true };
  }
};

describe("GPT request guard", () => {
  it("limits failed access attempts and never acquires a lease for rejected access", async () => {
    const rateLimiter = new MemoryRateLimiter(() => 1000);
    const concurrencyLimiter = new MemoryConcurrencyLimiter();
    async function consumeFailures(
      remaining: number
    ): Promise<Awaited<ReturnType<typeof guardGptRequest>>[]> {
      if (remaining === 0) return [];
      const result = await guardGptRequest({
        consent: true,
        accessGranted: false,
        identity: { key: "local-test", source: "local_test", globallyEnforceable: false },
        rateLimiter,
        concurrencyLimiter,
        budget
      });
      return [result, ...(await consumeFailures(remaining - 1))];
    }
    const results = await consumeFailures(11);
    results.forEach((result, index) => {
      expect(result.allowed).toBe(false);
      if (!result.allowed)
        expect(result.code).toBe(index === 10 ? "rate_limited" : "gpt_access_denied");
    });
  });

  it("enforces concurrency and releases idempotently", async () => {
    const concurrencyLimiter = new MemoryConcurrencyLimiter();
    const common = {
      consent: true,
      accessGranted: true,
      identity: { key: "local-test", source: "local_test" as const, globallyEnforceable: false },
      rateLimiter: new MemoryRateLimiter(),
      concurrencyLimiter,
      budget
    };
    const first = await guardGptRequest(common);
    const second = await guardGptRequest(common);
    const third = await guardGptRequest(common);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third).toEqual({ allowed: false, code: "concurrency_limited" });
    if (first.allowed) {
      await first.lease.release();
      await first.lease.release();
    }
    expect((await guardGptRequest(common)).allowed).toBe(true);
  });

  it("fails closed when rate or concurrency adapters throw", async () => {
    const identity = {
      key: "local-test",
      source: "local_test" as const,
      globallyEnforceable: false
    };
    const rateFailure = await guardGptRequest({
      consent: true,
      accessGranted: true,
      identity,
      rateLimiter: {
        async consume() {
          throw new Error("offline");
        }
      },
      concurrencyLimiter: new MemoryConcurrencyLimiter(),
      budget
    });
    const concurrencyFailure = await guardGptRequest({
      consent: true,
      accessGranted: true,
      identity,
      rateLimiter: new MemoryRateLimiter(),
      concurrencyLimiter: {
        async acquire() {
          throw new Error("offline");
        }
      },
      budget
    });
    expect(rateFailure).toEqual({ allowed: false, code: "budget_restricted" });
    expect(concurrencyFailure).toEqual({ allowed: false, code: "budget_restricted" });
  });

  it("uses sliding windows and returns a positive retry delay", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    const input = { key: "client", scope: "gpt_minute" as const, limit: 1, windowMs: 60_000 };
    expect(await limiter.consume(input)).toMatchObject({ allowed: true });
    now = 59_999;
    expect(await limiter.consume(input)).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    now = 60_000;
    expect(await limiter.consume(input)).toMatchObject({ allowed: true });
  });

  it("rejects invalid memory limiter configuration", async () => {
    await expect(
      new MemoryRateLimiter().consume({ key: "x", scope: "gpt_minute", limit: 0, windowMs: 1 })
    ).rejects.toThrow(RangeError);
    await expect(new MemoryConcurrencyLimiter().acquire("x", 0)).rejects.toThrow(RangeError);
  });
});
