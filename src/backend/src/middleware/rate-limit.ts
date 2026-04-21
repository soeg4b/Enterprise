// In-memory token bucket — sufficient for MVP single-instance.
// For multi-instance use Redis (`incr` + `expire`).

interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOpts {
  capacity: number;     // max tokens
  refillPerSecond: number; // tokens added per second
}

export function tryConsume(key: string, opts: RateLimitOpts): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: opts.capacity, last: now };
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsed * opts.refillPerSecond);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

// Periodic cleanup of stale buckets to avoid memory growth.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of buckets) {
    if (v.last < cutoff) buckets.delete(k);
  }
}, 5 * 60 * 1000).unref?.();
