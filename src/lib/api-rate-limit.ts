import { getRedis } from './redis';

/**
 * Fixed-window limiter for our own public API, keyed by API key.
 *
 * Unlike the provider-side limiter this one rejects instead of waiting: a client
 * over budget should get a fast 429, not a held connection.
 *
 * Backed by Redis when REDIS_URL is set, so the limit is shared across every
 * instance. Without it the window is per-process, which is correct only for a
 * single-instance deployment. A Redis failure degrades to the local window
 * rather than failing the request.
 */

interface Window {
  count: number;
  resetAtMs: number;
}

const windows = new Map<string, Window>();

let now = () => Date.now();

export function __setClockForTests(fn: () => number) {
  now = fn;
}

export function __resetApiRateLimiter() {
  windows.clear();
  now = () => Date.now();
}

export interface RateLimitVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

function verdictFrom(count: number, limit: number, resetAtMs: number, current: number): RateLimitVerdict {
  const allowed = count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    resetAtMs,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAtMs - current) / 1000)),
  };
}

/** Process-local window. Also the fallback when Redis is unreachable. */
export function consumeLocal(key: string, limit: number, windowMs: number): RateLimitVerdict {
  const current = now();
  const existing = windows.get(key);

  if (!existing || existing.resetAtMs <= current) {
    const fresh: Window = { count: 1, resetAtMs: current + windowMs };
    windows.set(key, fresh);
    if (windows.size > 10_000) sweep(current);
    return verdictFrom(1, limit, fresh.resetAtMs, current);
  }

  existing.count += 1;
  return verdictFrom(existing.count, limit, existing.resetAtMs, current);
}

/**
 * Increment and read the TTL in one atomic step.
 *
 * The expiry is set only on the first write of a window, otherwise every request
 * would push the reset forward and the window would never close. A Lua script
 * keeps that check-and-set atomic and works on any Redis version.
 */
const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
`;

export async function consume(key: string, limit: number, windowMs: number): Promise<RateLimitVerdict> {
  const redis = await getRedis();
  if (!redis) return consumeLocal(key, limit, windowMs);

  try {
    const [count, ttlMs] = (await redis.eval(FIXED_WINDOW_SCRIPT, 1, `ratelimit:${key}`, windowMs)) as [number, number];

    const current = now();
    return verdictFrom(Number(count), limit, current + (ttlMs > 0 ? Number(ttlMs) : windowMs), current);
  } catch (err) {
    console.error('[rate-limit] Redis unavailable, falling back to the local window:', (err as Error).message);
    return consumeLocal(key, limit, windowMs);
  }
}

function sweep(current: number) {
  for (const [key, window] of windows) {
    if (window.resetAtMs <= current) windows.delete(key);
  }
}

export const DEFAULT_LIMIT = Number(process.env.API_RATE_LIMIT_PER_MINUTE || 600);
export const DEFAULT_WINDOW_MS = 60_000;
