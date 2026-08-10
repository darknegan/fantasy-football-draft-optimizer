/**
 * Shared Sleeper egress budget. Documented ceiling is <1000/min/IP;
 * we target a conservative global budget with backoff on 429.
 */

export interface RateLimiterOptions {
  /** Max calls per window. Default 600 (well under 1000). */
  maxPerWindow?: number;
  windowMs?: number;
}

export class SleeperRateLimiter {
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private timestamps: number[] = [];
  private backoffUntil = 0;
  private consecutive429 = 0;

  constructor(opts: RateLimiterOptions = {}) {
    this.maxPerWindow = opts.maxPerWindow ?? 600;
    this.windowMs = opts.windowMs ?? 60_000;
  }

  /** Milliseconds to wait before the next call is allowed (0 = now). */
  delayMs(now = Date.now()): number {
    if (now < this.backoffUntil) return this.backoffUntil - now;
    this.prune(now);
    if (this.timestamps.length < this.maxPerWindow) return 0;
    const oldest = this.timestamps[0] ?? now;
    return Math.max(0, oldest + this.windowMs - now);
  }

  async acquire(): Promise<void> {
    for (;;) {
      const wait = this.delayMs();
      if (wait <= 0) {
        this.timestamps.push(Date.now());
        return;
      }
      await sleep(Math.min(wait, 5_000));
    }
  }

  recordSuccess() {
    this.consecutive429 = 0;
  }

  record429() {
    this.consecutive429 += 1;
    const backoff = Math.min(60_000, 1_000 * 2 ** Math.min(this.consecutive429, 5));
    this.backoffUntil = Date.now() + backoff;
  }

  snapshot() {
    this.prune(Date.now());
    return {
      callsInWindow: this.timestamps.length,
      maxPerWindow: this.maxPerWindow,
      backoffUntil: this.backoffUntil,
      consecutive429: this.consecutive429,
    };
  }

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t >= cutoff);
  }
}

function sleep(ms: number) {
  // Avoid unbound setTimeout (Illegal invocation on some Workers runtimes).
  return new Promise((r) => globalThis.setTimeout(r, ms));
}

/** Process-wide shared limiter for all Sleeper egress. */
export const sharedSleeperLimiter = new SleeperRateLimiter();
