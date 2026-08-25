import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __setRedisForTests, __resetRedis, isRedisEnabled } from '@/lib/redis';
import { consume, __resetApiRateLimiter, __setClockForTests as setApiClock } from '@/lib/api-rate-limit';
import { acquireSlot, __resetRateLimiter, __setClockForTests } from '@/lib/providers/core/rate-limit';

/**
 * Exercises the Redis-backed paths with a fake that implements just enough of
 * the two Lua scripts, plus the fallback behaviour when Redis is unreachable.
 */

interface FakeState {
  counters: Map<string, { count: number; expiresAtMs: number }>;
  buckets: Map<string, { tokens: number; ts: number }>;
}

function fakeRedis(clock: () => number, opts: { failing?: boolean } = {}) {
  const state: FakeState = { counters: new Map(), buckets: new Map() };
  const calls: string[] = [];

  const eval_ = vi.fn(async (script: string, _numKeys: number, key: string, ...args: any[]) => {
    calls.push(key);
    if (opts.failing) throw new Error('connection refused');

    // Fixed window: INCR + PEXPIRE on first write.
    if (script.includes('INCR')) {
      const windowMs = Number(args[0]);
      const existing = state.counters.get(key);
      const current = clock();

      if (!existing || existing.expiresAtMs <= current) {
        state.counters.set(key, { count: 1, expiresAtMs: current + windowMs });
        return [1, windowMs];
      }
      existing.count += 1;
      return [existing.count, existing.expiresAtMs - current];
    }

    // Token bucket: refill from elapsed time, consume or report the wait.
    const [rate, capacity, nowMs] = args.map(Number);
    const existing = state.buckets.get(key) ?? { tokens: capacity, ts: nowMs };
    const elapsed = Math.max(0, nowMs - existing.ts);
    let tokens = Math.min(capacity, existing.tokens + elapsed * rate);

    let waitMs = 0;
    if (tokens >= 1) tokens -= 1;
    else waitMs = Math.ceil((1 - tokens) / rate);

    state.buckets.set(key, { tokens, ts: nowMs });
    return waitMs;
  });

  return { redis: { eval: eval_ } as any, calls, state };
}

describe('redis wiring', () => {
  afterEach(() => __resetRedis());

  it('is disabled without REDIS_URL', async () => {
    __resetRedis();
    delete process.env.REDIS_URL;
    expect(await isRedisEnabled()).toBe(false);
  });

  it('is enabled once an instance is provided', async () => {
    __setRedisForTests({} as any);
    expect(await isRedisEnabled()).toBe(true);
  });
});

describe('api rate limiter over redis', () => {
  let clock = 1_000;

  beforeEach(() => {
    clock = 1_000;
    __resetApiRateLimiter();
    setApiClock(() => clock);
  });
  afterEach(() => {
    __resetRedis();
    __resetApiRateLimiter();
  });

  it('shares the window across callers', async () => {
    const { redis } = fakeRedis(() => clock);
    __setRedisForTests(redis);

    expect((await consume('shared', 2, 60_000)).allowed).toBe(true);
    expect((await consume('shared', 2, 60_000)).allowed).toBe(true);

    const denied = await consume('shared', 2, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('does not slide the window forward on each request', async () => {
    const { redis } = fakeRedis(() => clock);
    __setRedisForTests(redis);

    await consume('slide', 10, 60_000);
    clock += 30_000;
    const second = await consume('slide', 10, 60_000);

    // The reset must stay anchored to the first request, not move to now+60s.
    expect(second.resetAtMs).toBe(1_000 + 60_000);
  });

  it('keys are namespaced so they cannot collide with other state', async () => {
    const { redis, calls } = fakeRedis(() => clock);
    __setRedisForTests(redis);

    await consume('client:abc', 5, 60_000);
    expect(calls[0]).toBe('ratelimit:client:abc');
  });

  it('falls back to the local window when redis throws', async () => {
    const { redis } = fakeRedis(() => clock, { failing: true });
    __setRedisForTests(redis);

    // Must not reject: a Redis outage cannot take the API down with it.
    const verdict = await consume('fallback', 1, 60_000);
    expect(verdict.allowed).toBe(true);
    expect((await consume('fallback', 1, 60_000)).allowed).toBe(false);
  });
});

describe('provider rate limiter over redis', () => {
  let clock = 0;

  beforeEach(() => {
    clock = 0;
    __resetRateLimiter();
    __setClockForTests(() => clock);
  });
  afterEach(() => {
    __resetRedis();
    __resetRateLimiter();
  });

  it('lets a burst through without waiting', async () => {
    const { redis } = fakeRedis(() => clock);
    __setRedisForTests(redis);

    for (let i = 0; i < 5; i++) {
      expect(await acquireSlot('p:acct', { requestsPerSecond: 5, burst: 5 }, async () => {})).toBe(0);
    }
  });

  it('waits once the burst is spent', async () => {
    const { redis } = fakeRedis(() => clock);
    __setRedisForTests(redis);
    const sleep = async (ms: number) => { clock += ms; };

    await acquireSlot('p:spent', { requestsPerSecond: 2, burst: 1 }, sleep);
    const waited = await acquireSlot('p:spent', { requestsPerSecond: 2, burst: 1 }, sleep);

    // At 2 req/s a fresh token takes 500ms.
    expect(waited).toBe(500);
  });

  it('shares the bucket across instances', async () => {
    const { redis, state } = fakeRedis(() => clock);
    __setRedisForTests(redis);

    // Two "instances" hitting the same account draw from one bucket.
    await acquireSlot('p:same', { requestsPerSecond: 10, burst: 2 }, async () => {});
    await acquireSlot('p:same', { requestsPerSecond: 10, burst: 2 }, async () => {});

    expect(state.buckets.get('bucket:p:same')!.tokens).toBeLessThan(1);
  });

  it('falls back to the local bucket when redis throws', async () => {
    const { redis } = fakeRedis(() => clock, { failing: true });
    __setRedisForTests(redis);

    expect(await acquireSlot('p:fallback', { requestsPerSecond: 5, burst: 5 }, async () => {})).toBe(0);
  });

  it('stays a no-op when the manifest declares no limit', async () => {
    const { redis, calls } = fakeRedis(() => clock);
    __setRedisForTests(redis);

    expect(await acquireSlot('p:none', undefined, async () => {})).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
