import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashApiKey } from '@/lib/crypto';

/**
 * The credential that crosses clients.
 *
 * Every other key in this platform is one client by construction. This one is
 * not, so the tests that matter are about the boundary between the two: a
 * client key must be worth nothing here, an admin key must be worth nothing
 * over there, and a revoked one must be worth nothing anywhere.
 */

const state = vi.hoisted(() => ({
  adminKeys: new Map<string, { id: string; revokedAt: Date | null }>(),
  clients: [] as { id: string; name: string; createdAt: Date }[],
  apiKeys: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  updated: [] as { id: string; data: Record<string, unknown> }[],
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    adminKey: {
      findUnique: async ({ where }: { where: { keyHash: string } }) => state.adminKeys.get(where.keyHash) ?? null,
      update: async () => ({}),
    },
    apiKey: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.apiKeys.find((key) => key.id === where.id) ?? null,
      findMany: async () => state.apiKeys,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `key-${state.created.length + 1}`, createdAt: new Date(), lastUsedAt: null, revokedAt: null, ...data };
        state.created.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updated.push({ id: where.id, data });
        return { ...state.apiKeys.find((key) => key.id === where.id), ...data };
      },
    },
    client: {
      findMany: async () => state.clients.map((client) => ({ ...client, _count: { linkedAccounts: 0 }, apiKeys: [] })),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const client = state.clients.find((entry) => entry.id === where.id);
        return client ? { ...client, linkedAccounts: [] } : null;
      },
      create: async ({ data }: { data: { name: string } }) => {
        const client = { id: `client-${state.clients.length + 1}`, name: data.name, createdAt: new Date() };
        state.clients.push(client);
        return client;
      },
      update: async ({ where, data }: { where: { id: string }; data: { name: string } }) => {
        const client = state.clients.find((entry) => entry.id === where.id)!;
        client.name = data.name;
        return client;
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));

vi.mock('@/lib/request-log', () => ({ recordRequest: () => {} }));
vi.mock('@/lib/api-rate-limit', () => ({
  consume: async () => ({ allowed: true, limit: 600, retryAfterSeconds: 0 }),
  DEFAULT_LIMIT: 600,
  DEFAULT_WINDOW_MS: 60_000,
}));

const clientsRoute = await import('@/app/api/admin/v1/clients/route');
const clientRoute = await import('@/app/api/admin/v1/clients/[id]/route');
const keysRoute = await import('@/app/api/admin/v1/clients/[id]/keys/route');
const keyRoute = await import('@/app/api/admin/v1/keys/[id]/route');

const ADMIN_KEY = 'oip_admin_good';
const CLIENT_KEY = 'oip_live_something';

function request(path: string, init: { method?: string; body?: unknown; key?: string } = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? 'GET',
    headers: init.key ? { Authorization: `Bearer ${init.key}` } : {},
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.adminKeys = new Map([[hashApiKey(ADMIN_KEY), { id: 'admin-1', revokedAt: null }]]);
  state.clients = [{ id: 'client-1', name: 'LadiGroup', createdAt: new Date('2026-09-01T10:00:00Z') }];
  state.apiKeys = [
    {
      id: 'key-old',
      clientId: 'client-1',
      keyPrefix: 'oip_live_abc',
      name: 'Backend',
      scopes: ['read:contacts'],
      createdAt: new Date('2026-09-01T10:00:00Z'),
      lastUsedAt: null,
      revokedAt: null,
    },
  ];
  state.created = [];
  state.updated = [];
});

describe('who gets in', () => {
  it('refuses a request with no key', async () => {
    const response = await clientsRoute.GET(request('/api/admin/v1/clients'), params(''));
    expect(response.status).toBe(401);
  });

  // The whole point of a separate table and a separate prefix.
  it('refuses a client key, with the same answer as an invented one', async () => {
    const withClientKey = await clientsRoute.GET(request('/api/admin/v1/clients', { key: CLIENT_KEY }), params(''));
    const withNonsense = await clientsRoute.GET(request('/api/admin/v1/clients', { key: 'oip_admin_nope' }), params(''));

    expect(withClientKey.status).toBe(401);
    expect(await withClientKey.json()).toMatchObject({ error: (await withNonsense.json()).error });
  });

  it('refuses a revoked admin key', async () => {
    state.adminKeys.set(hashApiKey(ADMIN_KEY), { id: 'admin-1', revokedAt: new Date() });

    const response = await clientsRoute.GET(request('/api/admin/v1/clients', { key: ADMIN_KEY }), params(''));
    expect(response.status).toBe(401);
  });
});

describe('clients', () => {
  it('creates one and gives back its id', async () => {
    const response = await clientsRoute.POST(
      request('/api/admin/v1/clients', { method: 'POST', body: { name: 'Nova Empresa' }, key: ADMIN_KEY }),
      params('')
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: 'Nova Empresa' });
  });

  it('refuses a client with no name', async () => {
    const response = await clientsRoute.POST(
      request('/api/admin/v1/clients', { method: 'POST', body: { name: '  ' }, key: ADMIN_KEY }),
      params('')
    );

    expect(response.status).toBe(400);
  });

  it('answers 404 for an id that is not there', async () => {
    const response = await clientRoute.GET(request('/api/admin/v1/clients/nope', { key: ADMIN_KEY }), params('nope'));
    expect(response.status).toBe(404);
  });
});

describe('keys', () => {
  it('issues one, shows the plaintext once, and stores only a hash', async () => {
    const response = await keysRoute.POST(
      request('/api/admin/v1/clients/client-1/keys', {
        method: 'POST',
        body: { name: 'Hub', scopes: ['read:contacts', 'read:companies'] },
        key: ADMIN_KEY,
      }),
      params('client-1')
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.key).toMatch(/^oip_live_/);
    expect(body.scopes).toEqual(['read:contacts', 'read:companies']);
    expect(state.created[0].keyHash).toBe(hashApiKey(body.key));
    expect(state.created[0]).not.toHaveProperty('key');
  });

  // Asking for a scope and silently getting everything would be the worst
  // possible way to be wrong.
  it('refuses scopes it cannot read rather than falling back to all of them', async () => {
    const response = await keysRoute.POST(
      request('/api/admin/v1/clients/client-1/keys', {
        method: 'POST',
        body: { scopes: ['admin:everything'] },
        key: ADMIN_KEY,
      }),
      params('client-1')
    );

    expect(response.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });

  it('defaults to full access when no scopes are asked for', async () => {
    await keysRoute.POST(
      request('/api/admin/v1/clients/client-1/keys', { method: 'POST', body: {}, key: ADMIN_KEY }),
      params('client-1')
    );

    expect(state.created[0].scopes).toEqual(['read:*', 'write:*']);
  });

  it('revokes, and revoking again is not an error', async () => {
    const first = await keyRoute.DELETE(request('/api/admin/v1/keys/key-old', { method: 'DELETE', key: ADMIN_KEY }), params('key-old'));
    expect(first.status).toBe(200);
    expect(state.updated[0]).toMatchObject({ id: 'key-old' });

    state.apiKeys[0].revokedAt = new Date();
    const second = await keyRoute.DELETE(request('/api/admin/v1/keys/key-old', { method: 'DELETE', key: ADMIN_KEY }), params('key-old'));
    expect(second.status).toBe(200);
  });

  // Two calls would leave a window where both keys work or neither does.
  it('rotates in one call, keeping the name and the scopes', async () => {
    const response = await keyRoute.POST(
      request('/api/admin/v1/keys/key-old', { method: 'POST', key: ADMIN_KEY }),
      params('key-old')
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.replaced).toBe('key-old');
    expect(body.scopes).toEqual(['read:contacts']);
    expect(state.created[0].name).toBe('Backend');
    expect(state.updated[0]).toMatchObject({ id: 'key-old' });
    expect(state.updated[0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('refuses to rotate a key that is already revoked', async () => {
    state.apiKeys[0].revokedAt = new Date();

    const response = await keyRoute.POST(
      request('/api/admin/v1/keys/key-old', { method: 'POST', key: ADMIN_KEY }),
      params('key-old')
    );

    expect(response.status).toBe(409);
  });
});
