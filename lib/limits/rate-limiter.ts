export type RateLimitScope = "gpt_minute" | "gpt_hour" | "failed_access";

export interface RateLimiter {
  consume(input: {
    key: string;
    scope: RateLimitScope;
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async consume(input: {
    key: string;
    scope: RateLimitScope;
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    if (
      !Number.isFinite(input.limit) ||
      !Number.isInteger(input.limit) ||
      input.limit <= 0 ||
      !Number.isFinite(input.windowMs) ||
      input.windowMs <= 0
    ) {
      throw new RangeError("invalid_rate_limit_configuration");
    }
    const bucketKey = `${input.scope}:${input.key}`;
    const now = this.now();
    const active = (this.entries.get(bucketKey) ?? []).filter((at) => now - at < input.windowMs);
    if (active.length >= input.limit) {
      this.entries.set(bucketKey, active);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((active[0] + input.windowMs - now) / 1000))
      };
    }
    active.push(now);
    this.entries.set(bucketKey, active);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
