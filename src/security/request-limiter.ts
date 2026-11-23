import { createHash } from 'node:crypto';

export interface RateLimitPrincipal {
  readonly tenantId: string;
  readonly sub: string;
}

export interface Admission {
  readonly accepted: boolean;
  /** Whole seconds until the caller should retry. Never expose internal counters. */
  readonly retryAfterSeconds?: number;
  /** Idempotent, call when the HTTP response finishes or closes. */
  readonly release?: () => void;
}

interface Bucket {
  windowStart: number;
  requests: number;
  inflight: number;
}

/**
 * Bounded, fail-closed *per-process* limiter; not a distributed quota system.
 * Principals are hashed so identifiers are not retained in the accounting map.
 */
export class RequestLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly options: Readonly<{
      windowMs: number;
      maxRequests: number;
      maxInflight: number;
      maxPrincipals: number;
      clock?: () => number;
    }> = { windowMs: 60_000, maxRequests: 60, maxInflight: 4, maxPrincipals: 5_000 },
  ) {
    if (![options.windowMs, options.maxRequests, options.maxInflight, options.maxPrincipals].every(
      value => Number.isSafeInteger(value) && value > 0,
    )) throw new RangeError('INVALID_LIMIT_CONFIGURATION');
  }

  tryAcquire(principal: RateLimitPrincipal): Admission {
    if (!principal || typeof principal.sub !== 'string' || !principal.sub ||
        typeof principal.tenantId !== 'string' || !principal.tenantId) return { accepted: false, retryAfterSeconds: 60 };

    const now = (this.options.clock ?? Date.now)();
    if (!Number.isFinite(now)) return { accepted: false, retryAfterSeconds: 60 };

    const id = createHash('sha256').update(JSON.stringify([principal.tenantId, principal.sub])).digest('hex');
    let bucket = this.buckets.get(id);
    const elapsed = bucket ? now - bucket.windowStart : 0;
    if (bucket && elapsed >= this.options.windowMs && bucket.inflight === 0) {
      this.buckets.delete(id);
      bucket = undefined;
    }
    if (!bucket) {
      if (this.buckets.size >= this.options.maxPrincipals) this.expireIdle(now);
      // Refuse new principals when the accounting map is full instead of evicting active users.
      if (this.buckets.size >= this.options.maxPrincipals) return { accepted: false, retryAfterSeconds: 60 };
      bucket = { windowStart: now, requests: 0, inflight: 0 };
      this.buckets.set(id, bucket);
    }
    // A busy bucket cannot be deleted/reset until every in-flight exchange releases.
    const secondsUntilReset = Math.max(1, Math.ceil((this.options.windowMs - (now - bucket.windowStart)) / 1_000));
    if (bucket.inflight >= this.options.maxInflight) return { accepted: false, retryAfterSeconds: 1 };
    if (bucket.requests >= this.options.maxRequests) return { accepted: false, retryAfterSeconds: secondsUntilReset };
    bucket.requests++;
    bucket.inflight++;
    let released = false;
    return {
      accepted: true,
      release: () => {
        if (released) return;
        released = true;
        bucket!.inflight = Math.max(0, bucket!.inflight - 1);
        if (bucket!.inflight === 0 && (this.options.clock ?? Date.now)() - bucket!.windowStart >= this.options.windowMs) {
          this.buckets.delete(id);
        }
      },
    };
  }

  private expireIdle(now: number): void {
    for (const [id, bucket] of this.buckets) {
      if (bucket.inflight === 0 && now - bucket.windowStart >= this.options.windowMs) this.buckets.delete(id);
    }
  }
}
