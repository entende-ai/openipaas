import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { hashApiKey } from '@/lib/crypto';
import { rdqlDateTime } from '@/lib/providers/implementations/rdstationcrm/provider';
import { findManifest } from '@/lib/providers/core/manifests';

/**
 * Reading only what changed.
 *
 * The dangerous failure here is not a refusal, it is a provider that ignores an
 * unknown filter and answers with its whole table: the caller asked for a delta
 * and got everything, with no way to tell. So a resource whose provider does
 * not document the filter must be refused rather than tried.
 */

const CLIENT = { id: 'client-1', name: 'LadiGroup' };

const state = vi.hoisted(() => ({
  keys: new Map<string, unknown>(),
  provider: 'RD_STATION_CRM',
  seen: [] as Record<string, unknown>[],
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
        provider: state.provider,
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
  consume: async () => ({ allowed: true, limit: 600, remaining: 599, retryAfterSeconds: 0 }),
  consumeForKey: async () => ({
    verdict: { allowed: true, limit: 600, remaining: 599, resetAtMs: 0, retryAfterSeconds: 0 },
    scope: 'key' as const,
  }),
  DEFAULT_LIMIT: 600,
  DEFAULT_KEY_LIMIT: 300,
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

const { withUnifiedAuth, parseListParams } = await import('@/lib/api-auth');

const route = withUnifiedAuth(async (req, auth) => {
  state.seen.push(auth.params);
  return NextResponse.json({ ok: true, path: new URL(req.url).pathname });
});

const KEY = 'oip_live_incremental';

async function call(path: string) {
  const response = await route(
    new NextRequest(`http://localhost${path}`, {
      headers: { Authorization: `Bearer ${KEY}`, 'X-Account-Token': 'tok-1' },
    }),
    { params: Promise.resolve({}) }
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  state.keys = new Map([[hashApiKey(KEY), { id: 'key-1', clientId: CLIENT.id, revokedAt: null, expiresAt: null, scopes: [] }]]);
  state.provider = 'RD_STATION_CRM';
  state.seen = [];
});

describe('asking for what changed', () => {
  it('passes the instant through on a resource that supports it', async () => {
    const { status } = await call('/api/unified/v1/contacts?updatedAfter=2026-09-01T00:00:00Z');

    expect(status).toBe(200);
    expect(state.seen[0].updatedAfter).toBe('2026-09-01T00:00:00Z');
  });

  it('refuses a resource the provider cannot filter', async () => {
    const { status, body } = await call('/api/unified/v1/customers?updatedAfter=2026-09-01T00:00:00Z');

    expect(status).toBe(501);
    expect(body.code).toBe('NOT_SUPPORTED');
    // The refusal is useful only if it says where the filter does work.
    expect(body.error).toContain('contacts');
    expect(state.seen).toHaveLength(0);
  });

  it('refuses every resource on a provider that declares none', async () => {
    state.provider = 'CONTA_AZUL';

    const { status } = await call('/api/unified/v1/customers?updatedAfter=2026-09-01T00:00:00Z');

    expect(status).toBe(501);
  });

  it('refuses something that is not a date', async () => {
    const { status, body } = await call('/api/unified/v1/contacts?updatedAfter=last-tuesday');

    expect(status).toBe(400);
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('leaves a request without it alone', async () => {
    const { status } = await call('/api/unified/v1/customers');

    expect(status).toBe(200);
    expect(state.seen[0].updatedAfter).toBeUndefined();
  });
});

describe('the RDQL the provider builds', () => {
  // RD documents `"YYYY-MM-DD HH:MM:SS"`, quoted because it contains a space.
  it('formats an instant the way RD documents, in UTC', () => {
    expect(rdqlDateTime('2026-09-01T12:30:45Z')).toBe('"2026-09-01 12:30:45"');
    expect(rdqlDateTime('2026-09-01T09:30:45-03:00')).toBe('"2026-09-01 12:30:45"');
  });
});

describe('what the catalog says', () => {
  it('declares the resources RD documents, and nothing else', () => {
    expect(findManifest('RD_STATION_CRM')?.incremental).toEqual(['contacts', 'companies', 'deals']);
    expect(findManifest('CONTA_AZUL')?.incremental ?? []).toEqual([]);
  });

  it('keeps updatedAfter out of the parsed params when absent', () => {
    const params = parseListParams(new URL('http://localhost/api/unified/v1/contacts?limit=10'));
    expect(params).not.toHaveProperty('updatedAfter');
  });
});
