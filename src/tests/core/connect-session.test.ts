import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A connect session is the authority to attach a provider account to one
 * client, handed to somebody we have no account for. Everything worth testing
 * here is a refusal: the link is single use, short lived, and the row rather
 * than the token decides whether it may still be used.
 */

process.env.DASHBOARD_SESSION_SECRET = 'connect-session-test-secret';
process.env.APP_URL = 'https://app.openipaas.test';

type Row = Record<string, any>;

const state = vi.hoisted(() => ({ rows: [] as Row[] }));

vi.mock('@/lib/prisma', () => ({
  default: {
    connectSession: {
      create: async ({ data }: { data: Row }) => {
        const row = { usedAt: null, linkedAccountId: null, ...data };
        state.rows.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.rows.find((row) => row.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const matched = state.rows.filter(
          (row) => row.id === where.id && (where.usedAt !== null || row.usedAt === null)
        );
        for (const row of matched) Object.assign(row, data);
        return { count: matched.length };
      },
    },
  },
}));

const {
  createConnectSession,
  resolveConnectSession,
  completeConnectSession,
  offeredProviders,
  outcomeUrl,
  readUrl,
  readOrigin,
  SESSION_TTL_MS,
} = await import('@/lib/connect-session');
const { mintConnectToken } = await import('@/lib/connect-token');

beforeEach(() => {
  state.rows = [];
});

const row = (id: string) => state.rows.find((entry) => entry.id === id)!;

describe('creating one', () => {
  it('returns a link and stores only a hash of its token', async () => {
    const created = await createConnectSession({ clientId: 'client-1', origins: ['https://app.example.com'] });

    expect(created.url).toBe(`https://app.openipaas.test/connect/${created.token}`);
    // The row is what a leaked database hands an attacker. It must not be a
    // working link.
    expect(JSON.stringify(row(created.id))).not.toContain(created.token);
    expect(row(created.id).tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expires within the advertised window', async () => {
    const created = await createConnectSession({ clientId: 'client-1' });

    expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(SESSION_TTL_MS - 5_000);
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(SESSION_TTL_MS);
  });
});

describe('resolving one', () => {
  it('answers ok for a fresh link', async () => {
    const created = await createConnectSession({ clientId: 'client-1' });

    const resolved = await resolveConnectSession(created.token);

    expect(resolved.state).toBe('ok');
    expect(resolved.state === 'ok' && resolved.session.clientId).toBe('client-1');
  });

  it('answers invalid for a token of a session that is gone', async () => {
    const created = await createConnectSession({ clientId: 'client-1' });
    state.rows = [];

    expect((await resolveConnectSession(created.token)).state).toBe('invalid');
  });

  /**
   * The signature says the claims were ours; only the hash says this is the
   * token we handed out. Without the hash check, anyone who could mint a token
   * for a known session id would have a live link to it.
   */
  it('answers invalid for a correctly signed token that was never the one issued', async () => {
    const created = await createConnectSession({ clientId: 'client-1' });
    const forged = await mintConnectToken({ sid: created.id, org: [], exp: Date.now() + 60_000 });

    expect(forged).not.toBe(created.token);
    expect((await resolveConnectSession(forged)).state).toBe('invalid');
    expect((await resolveConnectSession(created.token)).state).toBe('ok');
  });

  it('answers used once it has been completed, and says which connection', async () => {
    const created = await createConnectSession({ clientId: 'client-1' });
    await completeConnectSession(created.id, 'linked-1');

    const resolved = await resolveConnectSession(created.token);

    expect(resolved.state).toBe('used');
    expect(resolved.state === 'used' && resolved.session.linkedAccountId).toBe('linked-1');
  });

  it('answers expired once the window has passed', async () => {
    const created = await createConnectSession({ clientId: 'client-1' });
    row(created.id).expiresAt = new Date(Date.now() - 1);

    // The token carries the same instant, so the edge refuses it too.
    expect(['expired', 'invalid']).toContain((await resolveConnectSession(created.token)).state);
  });
});

describe('completing one', () => {
  it('can only be won once', async () => {
    const created = await createConnectSession({ clientId: 'client-1' });

    expect(await completeConnectSession(created.id, 'linked-1')).toBe(true);
    expect(await completeConnectSession(created.id, 'linked-2')).toBe(false);
    expect(row(created.id).linkedAccountId).toBe('linked-1');
  });
});

describe('what the page offers', () => {
  it('offers every connectable service when nothing is pinned', () => {
    expect(offeredProviders({ provider: null }).length).toBeGreaterThan(1);
  });

  it('offers exactly the pinned one', () => {
    const all = offeredProviders({ provider: null });
    const pinned = offeredProviders({ provider: all[0].slug });

    expect(pinned.map((manifest) => manifest.slug)).toEqual([all[0].slug]);
  });
});

describe('where the browser goes afterwards', () => {
  const session = (overrides: Row = {}) =>
    ({ id: 'session-1', redirectUrl: 'https://app.example.com/done', linkedAccountId: null, ...overrides }) as any;

  it('is nowhere when the product gave no redirect', () => {
    expect(outcomeUrl(session({ redirectUrl: null }), 'connected')).toBeNull();
  });

  it('carries the outcome in the query, so a plain redirect still reports', () => {
    const url = new URL(outcomeUrl(session({ linkedAccountId: 'linked-1' }), 'connected')!);

    expect(url.searchParams.get('status')).toBe('connected');
    expect(url.searchParams.get('session')).toBe('session-1');
    expect(url.searchParams.get('connection')).toBe('linked-1');
  });

  it('names no connection when there is none', () => {
    const url = new URL(outcomeUrl(session(), 'cancelled')!);

    expect(url.searchParams.get('status')).toBe('cancelled');
    expect(url.searchParams.has('connection')).toBe(false);
  });
});

describe('the URLs a product may hand us', () => {
  it('takes https, and localhost for development', () => {
    expect(readUrl('https://app.example.com/done', 'redirectUrl')).toEqual({
      value: 'https://app.example.com/done',
    });
    expect('value' in readUrl('http://localhost:3000/done', 'redirectUrl')).toBe(true);
  });

  // A redirect is somewhere we send a customer's browser, and an origin ends up
  // in a CSP header. Neither may be a scheme that runs code.
  it('refuses plain http elsewhere, other schemes, and nothing at all', () => {
    expect('error' in readUrl('http://app.example.com/done', 'redirectUrl')).toBe(true);
    expect('error' in readUrl('javascript:alert(1)', 'redirectUrl')).toBe(true);
    expect('error' in readUrl('not a url', 'redirectUrl')).toBe(true);
    expect('error' in readUrl('', 'redirectUrl')).toBe(true);
  });

  it('keeps only the origin part of an origin', () => {
    expect(readOrigin('https://app.example.com/some/path?x=1')).toEqual({ value: 'https://app.example.com' });
  });
});
