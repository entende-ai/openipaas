/**
 * Token-bucket limiter keyed by provider + connected account.
 *
 * Scope note: the bucket lives in the process memory, so with N server instances
 * the effective ceiling is N x requestsPerSecond. That is enough to stop a single
 * client from hammering an ERP; a hard global limit needs a shared store (Redis).
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
  capacity: number;
  refillPerMs: number;
}

const buckets = new Map<string, Bucket>();

/** Overridable so tests do not depend on the wall clock. */
let now = () => Date.now();

export function __setClockForTests(fn: () => number) {
  now = fn;
}

export function __resetRateLimiter() {
  buckets.clear();
  now = () => Date.now();
}

function getBucket(key: string, requestsPerSecond: number, burst: number): Bucket {
  const existing = buckets.get(key);
  if (existing) return existing;

  const bucket: Bucket = {
    tokens: burst,
    lastRefillMs: now(),
    capacity: burst,
    refillPerMs: requestsPerSecond / 1000,
  };
  buckets.set(key, bucket);
  return bucket;
}

function refill(bucket: Bucket) {
  const current = now();
  const elapsed = current - bucket.lastRefillMs;
  if (elapsed <= 0) return;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
  bucket.lastRefillMs = current;
}

/**
 * Resolves once a request slot is available. Returns how long it waited, which
 * the caller can log to spot accounts that are being throttled.
 */
export async function acquireSlot(
  key: string,
  limit: { requestsPerSecond: number; burst?: number } | undefined,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<number> {
  if (!limit || limit.requestsPerSecond <= 0) return 0;

  const burst = limit.burst ?? Math.max(1, Math.ceil(limit.requestsPerSecond));
  const bucket = getBucket(key, limit.requestsPerSecond, burst);

  let waited = 0;
  // Bounded loop: each iteration either consumes a token or sleeps for the exact
  // time needed to mint one, so it cannot spin.
  for (let i = 0; i < 100; i++) {
    refill(bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return waited;
    }
    const deficit = 1 - bucket.tokens;
    const waitMs = Math.ceil(deficit / bucket.refillPerMs);
    waited += waitMs;
    await sleep(waitMs);
  }

  return waited;
}
