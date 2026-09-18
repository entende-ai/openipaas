import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { hashApiKey } from '@/lib/crypto';

/**
 * Picking a connection by service name.
 *
 * The API key is the client. A request then names one of that client's
 * connections, by its connection token or by `X-Provider`. What these tests hold
 * in place is the part that must never go wrong: a service name resolves only
 * inside the key's own client, it refuses to guess between two accounts, and the
 * token path behaves exactly as it did before `X-Provider` existed.
 */

type Account = {
  id: string;
  clientId: string;
  provider: string;
  accountToken: string;
  credentials: { createdAt: Date }[];
  client: { id: string; name: string };
};

const LADI = { id: 'client-ladi', name: 'LadiGroup' };
const OTHER = { id: 'client-other', name: 'Someone Else' };

const state = vi.hoisted(() => ({
  accounts: [] as Account[],
  keys: new Map<string, { id: string; clientId: string; revokedAt: null; expiresAt: null }>(),
  logged: [] as { status: number; errorCode: string | null; linkedAccountId: string | null }[],
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    apiKey: {
      findUnique: async ({ where }: { where: { keyHash?: string } }) => (where.keyHash ? state.keys.get(where.keyHash) ?? null : null),
      update: async () => ({}),
    },
    linkedAccount: {
      findUnique: async ({ where }: { where: { accountToken: string } }) =>
        state.accounts.find((account) => account.accountToken === where.accountToken) ?? null,
      findMany: async ({ where, take }: { where: { clientId: string; provider: string }; take?: number }) =>
        state.accounts
          .filter((account) => account.clientId === where.clientId && account.provider === where.provider)
          .slice(0, take ?? Infinity),
    },
  },
}));

vi.mock('@/lib/request-log', () => ({
  recordRequest: (entry: { status: number; errorCode: string | null; linkedAccountId: string | null }) =>
    state.logged.push(entry),
}));

vi.mock('@/lib/api-rate-limit', () => ({
  consume: async () => ({ allowed: true, limit: 600, retryAfterSeconds: 0 }),
  DEFAULT_LIMIT: 600,
  DEFAULT_WINDOW_MS: 60_000,
}));

vi.mock('@/lib/token-refresh', () => ({ refreshCredential: async () => null }));

vi.mock('@/lib/credentials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/credentials')>()),
  // The real one decrypts; nothing here needs a readable token.
  toProviderContext: () => ({ accessToken: 'at' }),
}));

vi.mock('@/lib/providers/core/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/providers/core/registry')>()),
  createProvider: (slug: string) => ({ manifest: { slug } }),
}));

const { withUnifiedAuth } = await import('@/lib/api-auth');

/** Answers with which connection the request resolved to. */
const route = withUnifiedAuth(async (_req, auth) =>
  NextResponse.json({ connection: auth.linkedAccount.id, provider: auth.linkedAccount.provider })
);

const LADI_KEY = 'oip_test_ladi';
const OTHER_KEY = 'oip_test_other';

function account(id: string, client: typeof LADI, provider: string): Account {
  return { id, clientId: client.id, provider, accountToken: `tok-${id}`, credentials: [{ createdAt: new Date() }], client };
}

async function call(headers: Record<string, string>) {
  const response = await route(new NextRequest('http://localhost/api/unified/v1/contacts', { headers }), {
    params: Promise.resolve({}),
  });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  state.accounts = [
    account('rd-ladi', LADI, 'RD_STATION_CRM'),
    account('ca-ladi', LADI, 'CONTA_AZUL'),
    account('rd-other', OTHER, 'RD_STATION_CRM'),
  ];
  state.keys = new Map([
    [hashApiKey(LADI_KEY), { id: 'key-ladi', clientId: LADI.id, revokedAt: null, expiresAt: null }],
    [hashApiKey(OTHER_KEY), { id: 'key-other', clientId: OTHER.id, revokedAt: null, expiresAt: null }],
  ]);
  state.logged = [];
});

describe('the connection token, as before', () => {
  it('resolves the connection it names', async () => {
    const { status, body } = await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Account-Token': 'tok-ca-ladi' });

    expect(status).toBe(200);
    expect(body.connection).toBe('ca-ladi');
  });

  it('refuses a token from another client with the same answer as a made-up one', async () => {
    const foreign = await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Account-Token': 'tok-rd-other' });
    const invented = await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Account-Token': 'tok-nope' });

    expect(foreign.status).toBe(401);
    expect(foreign.body.error).toBe(invented.body.error);
  });
});

describe('the service name', () => {
  it('resolves the one connection the client has on that service', async () => {
    const { status, body } = await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Provider': 'CONTA_AZUL' });

    expect(status).toBe(200);
    expect(body.connection).toBe('ca-ladi');
  });

  it('is not case sensitive', async () => {
    const { body } = await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Provider': ' rd_station_crm ' });
    expect(body.connection).toBe('rd-ladi');
  });

  // The whole point of the key being the client: the same service name, sent
  // with another client's key, lands on that client's account and never on this one.
  it('stays inside the client the key belongs to', async () => {
    const mine = await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Provider': 'RD_STATION_CRM' });
    const theirs = await call({ Authorization: `Bearer ${OTHER_KEY}`, 'X-Provider': 'RD_STATION_CRM' });

    expect(mine.body.connection).toBe('rd-ladi');
    expect(theirs.body.connection).toBe('rd-other');
  });

  it('says so when the client has no account on that service', async () => {
    const { status, body } = await call({ Authorization: `Bearer ${OTHER_KEY}`, 'X-Provider': 'CONTA_AZUL' });

    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.error).toContain('Conta Azul');
  });

  // Guessing between two accounts would write to the wrong customer's system.
  it('refuses to guess between two accounts on the same service', async () => {
    state.accounts.push(account('rd-ladi-2', LADI, 'RD_STATION_CRM'));

    const { status, body } = await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Provider': 'RD_STATION_CRM' });

    expect(status).toBe(409);
    expect(body.code).toBe('AMBIGUOUS_CONNECTION');
    expect(body.error).toContain('X-Account-Token');
  });

  it('points at the catalog for a service that does not exist', async () => {
    const { status, body } = await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Provider': 'SALESFORCE_ISH' });

    expect(status).toBe(400);
    expect(body.error).toContain('/api/unified/v1/providers');
  });
});

describe('both, or neither', () => {
  // A caller that pinned an exact account must keep it even if it also sends a
  // service name, or adding a header could silently move its writes.
  it('lets the token win when both are sent', async () => {
    state.accounts.push(account('rd-ladi-2', LADI, 'RD_STATION_CRM'));

    const { status, body } = await call({
      Authorization: `Bearer ${LADI_KEY}`,
      'X-Provider': 'RD_STATION_CRM',
      'X-Account-Token': 'tok-rd-ladi-2',
    });

    expect(status).toBe(200);
    expect(body.connection).toBe('rd-ladi-2');
  });

  it('names both ways when neither is sent', async () => {
    const { status, body } = await call({ Authorization: `Bearer ${LADI_KEY}` });

    expect(status).toBe(400);
    expect(body.error).toContain('X-Provider');
    expect(body.error).toContain('X-Account-Token');
  });

  it('logs the connection a service name resolved to', async () => {
    await call({ Authorization: `Bearer ${LADI_KEY}`, 'X-Provider': 'CONTA_AZUL' });
    expect(state.logged.at(-1)).toMatchObject({ status: 200, linkedAccountId: 'ca-ladi' });
  });
});
