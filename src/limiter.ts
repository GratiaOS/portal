/** At most `max` things per `windowMs` for each key, counted over the last `windowMs`, not in fixed blocks. */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Past this many keys, the ones with nothing left inside the window are let go, so callers who never return do not pile up. */
  private static readonly SWEEP_AT = 1024;

  private sweep(t: number): void {
    for (const [key, hits] of this.hits) if (!hits.some((at) => at > t - this.windowMs)) this.hits.delete(key);
  }

  /** Counts something that went ahead before this limiter began (a restart, or an object that slept), at the time it did. */
  remember(key: string, at: number): void {
    const hits = this.hits.get(key) ?? [];
    hits.push(at);
    hits.sort((a, b) => a - b);
    this.hits.set(key, hits);
  }

  /** Like `take`, but only looks: `0` when it may go ahead, otherwise how long to wait. Nothing is counted. */
  wait(key: string): number {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => at > t - this.windowMs);
    return recent.length >= this.max ? recent[0] + this.windowMs - t : 0;
  }

  /** `0` when it may go ahead (and it is counted); otherwise how many milliseconds until it may. */
  take(key: string): number {
    const t = this.now();
    if (this.hits.size > SlidingWindowLimiter.SWEEP_AT) this.sweep(t);
    const recent = (this.hits.get(key) ?? []).filter((at) => at > t - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return recent[0] + this.windowMs - t;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return 0;
  }
}

/**
 * A few at once, then a pace: up to `capacity` things go ahead together, and after that one each `60000 / perMinute` ms, for each key.
 * It is a token bucket, kept as the time at which the bucket would be empty (so every number is whole milliseconds, with no
 * fractions of a token to add up): a key that has been quiet for as long as it takes to fill is the same as a key never seen.
 */
export class TokenBucket {
  /** For each key, when its bucket would be empty. */
  private readonly empty = new Map<string, number>();
  private readonly interval: number;
  private readonly tolerance: number;

  constructor(
    capacity: number,
    perMinute: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('TokenBucket needs a capacity of at least 1');
    if (!Number.isFinite(perMinute) || perMinute <= 0) throw new Error('TokenBucket needs a pace above 0 a minute');
    this.interval = 60_000 / perMinute;
    this.tolerance = (capacity - 1) * this.interval;
  }

  /** Past this many keys, the ones that are full again are let go: they are no different from a key never seen. */
  private static readonly SWEEP_AT = 1024;

  /** How many keys are held. */
  get size(): number {
    return this.empty.size;
  }

  /** `0` when it may go ahead (and a token is taken); otherwise how many milliseconds until it may. A refusal takes nothing. */
  take(key: string): number {
    const t = this.now();
    if (this.empty.size > TokenBucket.SWEEP_AT) for (const [k, at] of this.empty) if (at <= t) this.empty.delete(k);
    const at = Math.max(this.empty.get(key) ?? t, t);
    if (at - t > this.tolerance) return Math.ceil(at - t - this.tolerance);
    this.empty.set(key, at + this.interval);
    return 0;
  }
}
