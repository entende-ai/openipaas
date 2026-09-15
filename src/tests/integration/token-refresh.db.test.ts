import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { assertSeedable } from '../../../prisma/seed-guard';
import { decrypt } from '@/lib/crypto';
import type { ProviderContext } from '@/lib/providers/core/types';

/**
 * Proves what the unit tests cannot: that two instances renewing the same
 * credential at the same moment are serialized by Postgres itself, so a
 * rotating refresh token is spent once.
 *
 * Opt in by pointing INTEGRATION_DATABASE_URL at a disposable, migrated
 * database; CI does this in the migrations job. The test creates and deletes
 * only its own rows, and refuses any database that is not local.
 */
const url = process.env.INTEGRATION_DATABASE_URL;

/** Rotates like RD Station CRM: each refresh token works once. */
function rotatingTokenEndpoint(delayMs: number) {
  let generation = 1;
  let calls = 0;

  const fetchImpl = vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
    calls += 1;
    const presented = new URLSearchParams(init.body).get('refresh_token');
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    if (presented !== `rt-${generation}`) {
      return { ok: false, status: 400, text: async () => '{"error":"invalid_grant"}', json: async () => ({}) };
    }
    generation += 1;
    const body = { access_token: `at-${generation}`, refresh_token: `rt-${generation}`, expires_in: 7200 };
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
  });

  return { fetchImpl, calls: () => calls };
}

describe.skipIf(!url)('token refresh against a real Postgres', () => {
  let prisma: typeof import('@/lib/prisma').default;
  let refreshWithLock: typeof import('@/lib/token-refresh').refreshWithLock;
  let clientId: string;
  let credentialId: string;

  const ctx = (): ProviderContext => ({ credentialId, provider: 'CONTA_AZUL', accessToken: 'stale', secrets: {} });

  beforeAll(async () => {
    // The same rule the seed uses: only a database that is plainly disposable.
    // Built by hand rather than spread from process.env, so an
    // ALLOW_SEED_ON_REMOTE_DATABASE left in the environment cannot waive it.
    assertSeedable({ NODE_ENV: 'test', DATABASE_URL: url });

    process.env.DATABASE_URL = url;
    process.env.CONTA_AZUL_CLIENT_ID = 'app-id';
    process.env.CONTA_AZUL_CLIENT_SECRET = 'app-secret';

    // Imported only now, so the client is built against the database above.
    prisma = (await import('@/lib/prisma')).default;
    ({ refreshWithLock } = await import('@/lib/token-refresh'));

    const client = await prisma.client.create({ data: { name: 'token refresh integration test' } });
    clientId = client.id;
    const account = await prisma.linkedAccount.create({ data: { clientId, provider: 'CONTA_AZUL' } });
    const credential = await prisma.oAuthCredential.create({
      data: { linkedAccountId: account.id, accessToken: 'stale', refreshToken: 'rt-1' },
    });
    credentialId = credential.id;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await prisma.oAuthCredential.update({
      where: { id: credentialId },
      data: { accessToken: 'stale', refreshToken: 'rt-1', expiresAt: null },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    // Cascades to the linked account and the credential.
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.$disconnect();
  });

  it('serializes two instances renewing the same credential', async () => {
    const endpoint = rotatingTokenEndpoint(250);
    vi.stubGlobal('fetch', endpoint.fetchImpl);

    // refreshWithLock skips the in-process layer, so these two behave like two
    // separate servers that received a 401 at the same moment.
    const [a, b] = await Promise.all([refreshWithLock(ctx()), refreshWithLock(ctx())]);

    expect(endpoint.calls()).toBe(1);
    expect(a.accessToken).toBe('at-2');
    expect(b.accessToken).toBe('at-2');

    const row = await prisma.oAuthCredential.findUniqueOrThrow({ where: { id: credentialId } });
    expect(decrypt(row.accessToken)).toBe('at-2');
    expect(decrypt(row.refreshToken!)).toBe('rt-2');
  });

  it('keeps the waiter alive while the holder waits on a slow provider', async () => {
    // Longer than Prisma's 5s default transaction timeout, which is what the
    // waiter would die of while queued on the lock.
    const endpoint = rotatingTokenEndpoint(6_000);
    vi.stubGlobal('fetch', endpoint.fetchImpl);

    const [a, b] = await Promise.all([refreshWithLock(ctx()), refreshWithLock(ctx())]);

    expect(endpoint.calls()).toBe(1);
    expect(a.accessToken).toBe(b.accessToken);
  }, 20_000);
});
