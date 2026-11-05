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
