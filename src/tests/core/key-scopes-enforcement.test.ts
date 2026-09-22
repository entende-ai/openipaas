import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { hashApiKey } from '@/lib/crypto';

/**
 * A scoped key against the wrapper every route runs behind.
 *
 * The scope lib is tested on its own; what is worth proving here is that the
 * refusal happens before anything reaches a provider, and that it happens for
 * the write hidden inside a POST that reads like a command.
 */

const CLIENT = { id: 'client-1', name: 'LadiGroup' };

const state = vi.hoisted(() => ({
  keys: new Map<string, unknown>(),
  called: [] as string[],
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    apiKey: {
      findUnique: async ({ where }: { where: { keyHash?: string } }) =>
        where.keyHash ? state.keys.get(where.keyHash) ?? null : null,
      update: async () => ({}),
    },
    linkedAccount: {
      findUnique: async () => ({
        id: 'acc-1',
        clientId: CLIENT.id,
        provider: 'RD_STATION_CRM',
        accountToken: 'tok-1',
        label: 'RD',
        credentials: [{ createdAt: new Date() }],
        client: CLIENT,
      }),
      findMany: async () => [],
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
vi.mock('@/lib/providers/core/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/providers/core/registry')>()),
  createProvider: (slug: string) => ({ manifest: { slug } }),
}));

const { withUnifiedAuth } = await import('@/lib/api-auth');

const route = withUnifiedAuth(async (req) => {
  state.called.push(req.method);
  return NextResponse.json({ ok: true });
});

function key(scopes: string[]) {
  const plaintext = `oip_${scopes.join('_') || 'none'}`;
  state.keys.set(hashApiKey(plaintext), {
    id: 'key-1',
    clientId: CLIENT.id,
    revokedAt: null,
    expiresAt: null,
    scopes,
  });
  return plaintext;
}

async function call(apiKey: string, path: string, method = 'GET') {
  const response = await route(
    new NextRequest(`http://localhost${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Account-Token': 'tok-1' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    }),
    { params: Promise.resolve({}) }
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  state.keys = new Map();
  state.called = [];
});

describe('a key scoped to reading', () => {
  it('reads', async () => {
    const readOnly = key(['read:*']);
    const { status } = await call(readOnly, '/api/unified/v1/contacts');

    expect(status).toBe(200);
  });

  it('is refused a write, before the provider is touched', async () => {
    const readOnly = key(['read:*']);
    const { status, body } = await call(readOnly, '/api/unified/v1/contacts', 'POST');

    expect(status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(body.error).toContain('read everything');
    expect(state.called).toHaveLength(0);
  });

  // The endpoint that deletes is a POST. Reading the verb rather than the path
  // is what keeps that from being a hole.
  it('is refused a bulk delete, which is spelled as a POST', async () => {
    const readOnly = key(['read:*']);
    const { status } = await call(readOnly, '/api/unified/v1/customers/bulk/delete', 'POST');

    expect(status).toBe(403);
  });
});

describe('a key scoped to one resource', () => {
  it('reaches that resource and no other', async () => {
    const contactsOnly = key(['read:contacts']);

    expect((await call(contactsOnly, '/api/unified/v1/contacts')).status).toBe(200);
    expect((await call(contactsOnly, '/api/unified/v1/deals')).status).toBe(403);
  });

  // Passthrough is the whole provider API. A contacts key reaching it would
  // make the resource scope decoration.
  it('cannot go around the scope through passthrough', async () => {
    const contactsOnly = key(['read:contacts']);
    const { status } = await call(contactsOnly, '/api/unified/v1/passthrough/deals');

    expect(status).toBe(403);
  });
});

describe('a key from before scopes', () => {
  it('still does everything', async () => {
    const legacy = key([]);

    expect((await call(legacy, '/api/unified/v1/contacts', 'POST')).status).toBe(200);
  });
});
