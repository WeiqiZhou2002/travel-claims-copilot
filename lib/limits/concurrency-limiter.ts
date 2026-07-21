export interface ConcurrencyLease {
  release(): Promise<void>;
}
export interface ConcurrencyLimiter {
  acquire(key: string, limit?: number): Promise<ConcurrencyLease | null>;
}

export class MemoryConcurrencyLimiter implements ConcurrencyLimiter {
  private readonly counts = new Map<string, number>();

  async acquire(key: string, limit = 2): Promise<ConcurrencyLease | null> {
    if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
      throw new RangeError("invalid_concurrency_limit_configuration");
    }
    const current = this.counts.get(key) ?? 0;
    if (current >= limit) return null;
    this.counts.set(key, current + 1);
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        const active = this.counts.get(key) ?? 0;
        if (active <= 1) this.counts.delete(key);
        else this.counts.set(key, active - 1);
      }
    };
  }
}
