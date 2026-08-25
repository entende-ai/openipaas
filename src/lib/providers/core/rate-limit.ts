import { getRedis } from '@/lib/redis';

/**
 * Token-bucket limiter keyed by provider + connected account.
 *
 * This one protects the *upstream* API: exceeding an ERP's documented rate is
 * how an account gets throttled or blocked, so callers wait for a slot rather
 * than being rejected.
 *
 * Backed by Redis when REDIS_URL is set, so the bucket is shared across
 * instances — otherwise N instances each grant the full rate and the effective
 * ceiling is N times the limit. A Redis failure degrades to the local bucket.
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
  capacity: number;
  refillPerMs: number;
}

const buckets = new Map<string, Bucket>();

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
 * Distributed token bucket.
 *
 * State is a hash of {tokens, lastRefillMs}. Refill is computed from elapsed
 * time on each call, so no background job is needed. Returns the wait in
 * milliseconds until a token is available, or 0 when one was consumed.
 */
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local rate = tonumber(ARGV[1])        -- tokens per ms
local capacity = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local ttlMs = tonumber(ARGV[4])

local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])

if tokens == nil then
  tokens = capacity
  ts = nowMs
end

local elapsed = math.max(0, nowMs - ts)
tokens = math.min(capacity, tokens + elapsed * rate)

local waitMs = 0
if tokens >= 1 then
  tokens = tokens - 1
else
  waitMs = math.ceil((1 - tokens) / rate)
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', nowMs)
redis.call('PEXPIRE', key, ttlMs)
return waitMs
`;

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
  const redis = await getRedis();

  if (redis) {
    try {
      return await acquireDistributed(redis, key, limit.requestsPerSecond, burst, sleep);
    } catch (err) {
      console.error('[provider-rate-limit] Redis unavailable, falling back to the local bucket:', (err as Error).message);
    }
  }

  return acquireLocal(key, limit.requestsPerSecond, burst, sleep);
}

async function acquireDistributed(
  redis: NonNullable<Awaited<ReturnType<typeof getRedis>>>,
  key: string,
  requestsPerSecond: number,
  burst: number,
  sleep: (ms: number) => Promise<void>
): Promise<number> {
  const rate = requestsPerSecond / 1000;
  // Long enough that an idle bucket refills to full before it is evicted.
  const ttlMs = Math.ceil((burst / rate) * 2) + 60_000;

  let waited = 0;
  for (let i = 0; i < 100; i++) {
    const waitMs = Number(
      await redis.eval(TOKEN_BUCKET_SCRIPT, 1, `bucket:${key}`, rate, burst, now(), ttlMs)
    );
    if (waitMs <= 0) return waited;

    waited += waitMs;
    await sleep(waitMs);
  }
  return waited;
}

export function acquireLocalSync(key: string, requestsPerSecond: number, burst: number): number {
  const bucket = getBucket(key, requestsPerSecond, burst);
  refill(bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return 0;
  }
  return Math.ceil((1 - bucket.tokens) / bucket.refillPerMs);
}

async function acquireLocal(
  key: string,
  requestsPerSecond: number,
  burst: number,
  sleep: (ms: number) => Promise<void>
): Promise<number> {
  let waited = 0;
  // Bounded: each iteration either consumes a token or sleeps exactly long
  // enough to mint one, so it cannot spin.
  for (let i = 0; i < 100; i++) {
    const waitMs = acquireLocalSync(key, requestsPerSecond, burst);
    if (waitMs <= 0) return waited;

    waited += waitMs;
    await sleep(waitMs);
  }
  return waited;
}
