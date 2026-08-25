/**
 * Fixed-window limiter for our own public API, keyed by API key.
 *
 * Unlike the provider-side limiter this one rejects instead of waiting: a client
 * over budget should get a fast 429, not a held connection.
 *
 * In-memory, so the effective ceiling scales with instance count. Swap the store
 * for Redis when a hard global limit is required.
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

export function consume(key: string, limit: number, windowMs: number): RateLimitVerdict {
  const current = now();
  const existing = windows.get(key);

  if (!existing || existing.resetAtMs <= current) {
    const fresh: Window = { count: 1, resetAtMs: current + windowMs };
    windows.set(key, fresh);
    // Opportunistic cleanup so the map cannot grow without bound.
    if (windows.size > 10_000) sweep(current);
    return { allowed: true, limit, remaining: limit - 1, resetAtMs: fresh.resetAtMs, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  const allowed = existing.count <= limit;

  return {
    allowed,
    limit,
    remaining,
    resetAtMs: existing.resetAtMs,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((existing.resetAtMs - current) / 1000)),
  };
}

function sweep(current: number) {
  for (const [key, window] of windows) {
    if (window.resetAtMs <= current) windows.delete(key);
  }
}

export const DEFAULT_LIMIT = Number(process.env.API_RATE_LIMIT_PER_MINUTE || 600);
export const DEFAULT_WINDOW_MS = 60_000;
