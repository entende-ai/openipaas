import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashApiKey } from '@/lib/crypto';

/**
 * GET /connections over the wrapper it actually runs behind.
 *
 * The listing is the first endpoint a key can call without naming a connection,
 * so the thing worth pinning down is the boundary: one key, one client's
 * connections, and nobody else's.
 */

const LADI = { id: 'client-ladi', name: 'LadiGroup' };
const OTHER = { id: 'client-other', name: 'Someone Else' };

const state = vi.hoisted(() => ({
  accounts: [] as Record<string, unknown>[],
  keys: new Map<string, unknown>(),
  logRows: [] as { linkedAccountId: string; _max: { createdAt: Date } }[],
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    apiKey: {
      findUnique: async ({ where }: { where: { keyHash?: string } }) =>
        where.keyHash ? state.keys.get(where.keyHash) ?? null : null,
      update: async () => ({}),
    },
    client: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        [LADI, OTHER].find((client) => client.id === where.id) ?? null,
    },
    linkedAccount: {
      findMany: async ({ where }: { where: { clientId: string } }) =>
        state.accounts.filter((account) => account.clientId === where.clientId),
    },
    requestLog: {
      groupBy: async () => state.logRows,
    },
  },
}));

vi.mock('@/lib/request-log', () => ({ recordRequest: () => {} }));

vi.mock('@/lib/api-rate-limit', () => ({
  consume: async () => ({ allowed: true, limit: 600, retryAfterSeconds: 0 }),
  DEFAULT_LIMIT: 600,
  DEFAULT_WINDOW_MS: 60_000,
}));

vi.mock('@/lib/token-refresh', () => ({ refreshCredential: async () => null }));

vi.mock('@/lib/credentials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/credentials')>()),
  toProviderContext: () => ({ accessToken: 'at' }),
}));

const { GET } = await import('@/app/api/unified/v1/connections/route');

const LADI_KEY = 'oip_list_ladi';
const OTHER_KEY = 'oip_list_other';

function account(id: string, clientId: string, provider: string, label: string) {
  return {
    id,
    clientId,
    provider,
    label,
    accountToken: `tok-${id}`,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    credentials: [
      {
        id: `cred-${id}`,
        linkedAccountId: id,
        accessToken: 'enc',
        refreshToken: 'enc',
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        createdAt: new Date('2026-09-01T10:00:00Z'),
        revokedAt: null,
      },
    ],
  };
}

async function call(key: string) {
  const response = await GET(
    new NextRequest('http://localhost/api/unified/v1/connections', { headers: { Authorization: `Bearer ${key}` } })
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  state.accounts = [
    account('rd-ladi', LADI.id, 'RD_STATION_CRM', 'RD da Ladi'),
    account('ca-ladi', LADI.id, 'CONTA_AZUL', 'Conta Azul'),
    account('rd-other', OTHER.id, 'RD_STATION_CRM', 'RD de outro'),
  ];
  state.keys = new Map<string, unknown>([
    [hashApiKey(LADI_KEY), { id: 'key-ladi', clientId: LADI.id, revokedAt: null, expiresAt: null }],
    [hashApiKey(OTHER_KEY), { id: 'key-other', clientId: OTHER.id, revokedAt: null, expiresAt: null }],
  ]);
  state.logRows = [];
});

describe('GET /connections', () => {
  it('lists the connections of this client, with the service name to send', async () => {
    const { status, body } = await call(LADI_KEY);

    expect(status).toBe(200);
    expect(body.totalItems).toBe(2);
    expect(body.items.map((item: { service: string }) => item.service)).toEqual(['RD_STATION_CRM', 'CONTA_AZUL']);
    expect(body.items[0]).toMatchObject({ label: 'RD da Ladi', status: 'active', connectionToken: 'tok-rd-ladi' });
  });

  // The boundary the whole design rests on.
  it('never shows the connections of another client', async () => {
    const { body } = await call(OTHER_KEY);

    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('rd-other');
  });

  it('refuses without a key', async () => {
    const response = await GET(new NextRequest('http://localhost/api/unified/v1/connections'));
    expect(response.status).toBe(401);
  });

  it('says when each connection was last reached', async () => {
    state.logRows = [{ linkedAccountId: 'rd-ladi', _max: { createdAt: new Date('2026-09-21T09:00:00Z') } }];

    const { body } = await call(LADI_KEY);

    expect(body.items[0].lastUsedAt).toBe('2026-09-21T09:00:00.000Z');
    expect(body.items[1].lastUsedAt).toBeNull();
  });
});
