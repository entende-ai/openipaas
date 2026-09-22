import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  consumeForKey,
  DEFAULT_KEY_LIMIT,
  DEFAULT_LIMIT,
  __resetApiRateLimiter,
  __setClockForTests,
} from '@/lib/api-rate-limit';

/**
 * Two budgets, because one client can have two very different callers.
 *
 * A nightly sync walking every page and an agent asking one question share a
 * client. On one counter the sync starves the agent, and what the person sees
 * is a slow product with nothing in the log to blame. So a key spends its own
 * budget first, inside the client's.
 */

let clock = 1_000_000;

beforeEach(() => {
  __resetApiRateLimiter();
  clock = 1_000_000;
  __setClockForTests(() => clock);
});

afterEach(() => {
  __resetApiRateLimiter();
});

async function spend(times: number, budget: { clientId: string; keyId: string; keyLimit?: number | null }) {
  let last = await consumeForKey(budget);
  for (let i = 1; i < times; i += 1) last = await consumeForKey(budget);
  return last;
}

describe('one key spending', () => {
  it('stops at its own limit, below the client one', () => {
    expect(DEFAULT_KEY_LIMIT).toBeLessThan(DEFAULT_LIMIT);
  });

  it('is refused once its own budget is gone, and says it was the key', async () => {
    const budget = { clientId: 'c1', keyId: 'k1', keyLimit: 3 };

    expect((await spend(3, budget)).verdict.allowed).toBe(true);

    const over = await consumeForKey(budget);
    expect(over.verdict.allowed).toBe(false);
    expect(over.scope).toBe('key');
    expect(over.verdict.limit).toBe(3);
  });

  // The whole point: the sync running out must not take the agent with it.
  it('leaves the other keys of the same client alone', async () => {
    await spend(4, { clientId: 'c1', keyId: 'sync', keyLimit: 3 });

    const agent = await consumeForKey({ clientId: 'c1', keyId: 'agent', keyLimit: 3 });

    expect(agent.verdict.allowed).toBe(true);
  });

  it('starts again in the next window', async () => {
    const budget = { clientId: 'c1', keyId: 'k1', keyLimit: 2 };
    await spend(3, budget);

    clock += 61_000;

    expect((await consumeForKey(budget)).verdict.allowed).toBe(true);
  });
});

describe('the client budget above it', () => {
  it('still holds when several keys add up to it', async () => {
    // Each key is within its own allowance; together they pass the client one.
    for (let i = 0; i < DEFAULT_LIMIT; i += 1) {
      await consumeForKey({ clientId: 'c2', keyId: `k${i % 10}`, keyLimit: DEFAULT_LIMIT });
    }

    const over = await consumeForKey({ clientId: 'c2', keyId: 'k0', keyLimit: DEFAULT_LIMIT });

    expect(over.verdict.allowed).toBe(false);
    expect(over.scope).toBe('client');
  });

  // A refused request must not also empty the key window, or a caller over the
  // client budget is punished twice and the key counter fills with requests
  // that never ran.
  it('does not charge the key when the client is already over', async () => {
    for (let i = 0; i < DEFAULT_LIMIT + 5; i += 1) {
      await consumeForKey({ clientId: 'c3', keyId: 'loud', keyLimit: DEFAULT_LIMIT });
    }

    clock += 61_000;

    const after = await consumeForKey({ clientId: 'c3', keyId: 'loud', keyLimit: DEFAULT_LIMIT });
    expect(after.verdict.allowed).toBe(true);
  });
});

describe('what the caller is told', () => {
  it('reports the tighter of the two budgets', async () => {
    const answer = await consumeForKey({ clientId: 'c4', keyId: 'k1', keyLimit: 5 });

    expect(answer.scope).toBe('key');
    expect(answer.verdict.limit).toBe(5);
  });

  it('falls back to the platform default when the key sets none', async () => {
    const answer = await consumeForKey({ clientId: 'c5', keyId: 'k1', keyLimit: null });

    expect(answer.verdict.limit).toBe(DEFAULT_KEY_LIMIT);
  });
});
