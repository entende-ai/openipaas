import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeContext } from '../helpers';

/**
 * The database is faked at the Prisma boundary. What matters here is the order
 * of operations around the lock and what becomes of the refresh token, which a
 * fake expresses precisely. That the lock really excludes a second instance
 * needs a real Postgres, and is proven in src/tests/integration.
 */
interface Row {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  erpClientId: string | null;
  erpClientSecret: string | null;
  linkedAccount: { provider: string };
}

const db = vi.hoisted(() => {
  const state = {
    row: null as Row | null,
    order: [] as string[],
    lockArgs: [] as unknown[],
    txOptions: undefined as unknown,
  };

  const tx = {
    $executeRaw: vi.fn(async (...args: unknown[]) => {
      state.order.push('lock');
      state.lockArgs = args;
      return 1;
    }),
    oAuthCredential: {
      findUnique: vi.fn(async () => {
        state.order.push('read');
        return state.row ? { ...state.row } : null;
      }),
      update: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        state.order.push('write');
        state.row = { ...state.row!, ...data };
        return state.row;
      }),
    },
  };

  const client = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown, options?: unknown) => {
      state.txOptions = options;
      return fn(tx);
    }),
    oAuthCredential: {
      findFirst: vi.fn(async () => (state.row ? { ...state.row } : null)),
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        state.order.push('create');
        return data;
      }),
    },
  };

  return { state, tx, client };
});

vi.mock('@/lib/prisma', () => ({ default: db.client }));

import {
  persistNewCredential,
  refreshCredential,
  REFRESH_LOCK_NAMESPACE,
  REFRESH_TRANSACTION_TIMEOUT_MS,
  TOKEN_REQUEST_TIMEOUT_MS,
} from '@/lib/token-refresh';
import { decrypt } from '@/lib/crypto';

function ctx(overrides: Parameters<typeof makeContext>[0] = {}) {
  return makeContext({ credentialId: 'cred-1', provider: 'CONTA_AZUL', accessToken: 'stale', ...overrides });
}

function seed(overrides: Partial<Row> = {}) {
  db.state.row = {
    id: 'cred-1',
    accessToken: 'stale',
    refreshToken: 'rt-1',
    expiresAt: null,
    erpClientId: null,
    erpClientSecret: null,
    linkedAccount: { provider: 'CONTA_AZUL' },
    ...overrides,
  };
}

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * A token endpoint that rotates the way RD Station CRM documents it: each
 * refresh token works exactly once, and presenting a spent one is refused.
 */
function tokenEndpoint(opts: { delayMs?: number; rotate?: boolean; status?: number } = {}) {
  let generation = 1;
  const calls: Array<{ refreshToken: string | null; signal: unknown }> = [];

  const fetchImpl = vi.fn(async (_url: string, init: { body: URLSearchParams; signal?: unknown }) => {
    const presented = new URLSearchParams(init.body).get('refresh_token');
    calls.push({ refreshToken: presented, signal: init.signal });

    if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    if (opts.status) return reply(opts.status, { error: 'server_error' });
    if (presented !== `rt-${generation}`) return reply(400, { error: 'invalid_grant' });

    const rotate = opts.rotate !== false;
    if (rotate) generation += 1;
    return reply(200, {
      access_token: `at-${calls.length + 1}`,
      ...(rotate ? { refresh_token: `rt-${generation}` } : {}),
      expires_in: 7200,
    });
  });

  return { fetchImpl, calls };
}

describe('refreshCredential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CONTA_AZUL_CLIENT_ID', 'app-id');
    vi.stubEnv('CONTA_AZUL_CLIENT_SECRET', 'app-secret');
    db.state.order = [];
    seed();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('spends the refresh token once when a burst of requests hits the expiry together', async () => {
    const endpoint = tokenEndpoint({ delayMs: 20 });
    vi.stubGlobal('fetch', endpoint.fetchImpl);

    const results = await Promise.all(Array.from({ length: 8 }, () => refreshCredential(ctx())));

    expect(endpoint.calls).toHaveLength(1);
    expect(new Set(results.map((r) => r.accessToken))).toEqual(new Set(['at-2']));
    expect(decrypt(db.state.row!.refreshToken!)).toBe('rt-2');
  });

  it('uses a token another instance already renewed instead of spending the refresh token', async () => {
    // What a waiter finds once the lock is released: the row moved on.
    seed({ accessToken: 'at-2', refreshToken: 'rt-2' });
    const endpoint = tokenEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);

    const result = await refreshCredential(ctx({ accessToken: 'stale' }));

    expect(result.accessToken).toBe('at-2');
    expect(endpoint.calls).toHaveLength(0);
    expect(db.tx.oAuthCredential.update).not.toHaveBeenCalled();
  });

  it('takes the lock before it reads the credential', async () => {
    vi.stubGlobal('fetch', tokenEndpoint().fetchImpl);

    await refreshCredential(ctx());

    // Reading first would let two instances both see the same refresh token.
    expect(db.state.order).toEqual(['lock', 'read', 'write']);
  });

  it('holds a transaction-scoped lock keyed on the credential', async () => {
    vi.stubGlobal('fetch', tokenEndpoint().fetchImpl);

    await refreshCredential(ctx());

    const [strings, ...values] = db.state.lockArgs as [TemplateStringsArray, ...unknown[]];
    // The session-scoped pg_advisory_lock would outlive a failed request and
    // wedge the credential; the xact form is released with the transaction.
    expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    expect(values).toEqual([REFRESH_LOCK_NAMESPACE, 'cred-1']);
  });

  it('keeps the stored refresh token when the provider does not rotate', async () => {
    vi.stubGlobal('fetch', tokenEndpoint({ rotate: false }).fetchImpl);

    await refreshCredential(ctx());

    expect(decrypt(db.state.row!.accessToken)).toBe('at-2');
    expect(decrypt(db.state.row!.refreshToken!)).toBe('rt-1');
  });

  it('writes nothing when the provider refuses the refresh', async () => {
    vi.stubGlobal('fetch', tokenEndpoint({ status: 400 }).fetchImpl);

    await expect(refreshCredential(ctx())).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(db.tx.oAuthCredential.update).not.toHaveBeenCalled();
  });

  it('lets a later refresh try again after one fails', async () => {
    vi.stubGlobal('fetch', tokenEndpoint({ status: 503 }).fetchImpl);
    await expect(refreshCredential(ctx())).rejects.toThrow();

    // A failure must not stay cached as the in-flight result.
    const endpoint = tokenEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);

    await expect(refreshCredential(ctx())).resolves.toMatchObject({ accessToken: 'at-2' });
    expect(endpoint.calls).toHaveLength(1);
  });

  it('bounds the token request and gives the transaction room to wait for it', async () => {
    const endpoint = tokenEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);

    await refreshCredential(ctx());

    expect(endpoint.calls[0].signal).toBeInstanceOf(AbortSignal);
    // Prisma defaults to 5s, less than a single slow token request.
    expect(db.state.txOptions).toEqual({ timeout: REFRESH_TRANSACTION_TIMEOUT_MS });
    expect(REFRESH_TRANSACTION_TIMEOUT_MS).toBeGreaterThan(2 * TOKEN_REQUEST_TIMEOUT_MS);
  });

  it('reports the new expiry, so the next request can renew ahead of it', async () => {
    vi.stubGlobal('fetch', tokenEndpoint().fetchImpl);
    const before = Date.now();

    const result = await refreshCredential(ctx());

    expect(result.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 7_200_000);
  });
});

describe('persistNewCredential', () => {
  const reconnect = { linkedAccountId: 'account-1', authType: 'OAUTH2', accessToken: 'reconnected', refreshToken: 'rt-new' };

  beforeEach(() => {
    vi.clearAllMocks();
    db.state.order = [];
    seed();
  });

  it('replaces an existing credential under the refresh lock', async () => {
    await persistNewCredential(reconnect);

    // Without the lock, a refresh in flight would write the old grant's tokens
    // back over these once it finished.
    expect(db.state.order).toEqual(['lock', 'write']);
    expect(db.state.lockArgs.slice(1)).toEqual([REFRESH_LOCK_NAMESPACE, 'cred-1']);
    expect(db.state.txOptions).toEqual({ timeout: REFRESH_TRANSACTION_TIMEOUT_MS });
    expect(decrypt(db.state.row!.accessToken)).toBe('reconnected');
  });

  it('creates a first credential without taking a lock', async () => {
    db.state.row = null;

    await persistNewCredential(reconnect);

    expect(db.state.order).toEqual(['create']);
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
  });
});
