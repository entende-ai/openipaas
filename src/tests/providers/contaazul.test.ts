import { describe, it, expect, vi } from 'vitest';
import { ContaAzulProvider } from '@/lib/providers/implementations/contaazul/provider';
import { readPage } from '@/lib/providers/core/pagination';
import { makeContext, stubFetch, noSleep } from '../helpers';

const ctx = makeContext({ provider: 'CONTA_AZUL', accessToken: 'live-token' });

function provider(responses: Parameters<typeof stubFetch>[0], extra = {}) {
  const stub = stubFetch(responses);
  return { stub, sut: new ContaAzulProvider({ fetchImpl: stub.fetch, sleep: noSleep, ...extra }) };
}

describe('ContaAzulProvider URLs', () => {
  it('never emits a duplicated /v1 segment', async () => {
    const { stub, sut } = provider([{ json: { items: [], itens: [], total_items: 0, total_itens: 0, atualizados: 0, ignorados: 0 } }]);

    await sut.listCustomers(ctx, {}).catch(() => {});
    await sut.listProducts(ctx, {}).catch(() => {});
    await sut.listSales(ctx, {}).catch(() => {});
    await sut.listSellers(ctx, {}).catch(() => {});
    await sut.getSale(ctx, '42').catch(() => {});
    await sut.bulkDeleteSales(ctx, ['42']).catch(() => {});
    await sut.listCategories(ctx, {}).catch(() => {});

    expect(stub.calls.length).toBeGreaterThan(0);
    for (const call of stub.calls) {
      expect(call.url, `duplicated /v1 in ${call.url}`).not.toContain('/v1/v1/');
      expect(call.url).toMatch(/^https:\/\/api-v2\.contaazul\.com\/v1\//);
    }
  });

  it('builds the expected sales endpoints', async () => {
    const { stub, sut } = provider([{ json: { itens: [], total_itens: 0 } }]);

    await sut.listSales(ctx, {});
    expect(stub.calls[0].url).toContain('https://api-v2.contaazul.com/v1/venda/busca');

    await sut.listSellers(ctx, {});
    expect(stub.calls[1].url).toBe('https://api-v2.contaazul.com/v1/venda/vendedores');
  });

  it('percent-encodes ids so they cannot escape the path', async () => {
    const { stub, sut } = provider([{ json: {} }]);
    await sut.getProduct(ctx, '../../admin').catch(() => {});

    expect(stub.calls[0].url).not.toContain('/admin');
    expect(stub.calls[0].url).toContain('%2F');
  });

  it('sends the bearer token', async () => {
    const { stub, sut } = provider([{ json: { items: [], total_items: 0 } }]);
    await sut.listCustomers(ctx, {});
    expect(stub.calls[0].auth).toBe('Bearer live-token');
  });
});

describe('ContaAzulProvider pagination', () => {
  it('reports a next cursor when a full page comes back', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `id-${i}`, nome: 'X', email: null, documento: null,
      tipo_pessoa: 'FISICA', ativo: true, data_criacao: '2024-01-01T00:00:00Z', data_alteracao: null,
    }));
    const { sut } = provider([{ json: { items, total_items: 120 } }]);

    const page = await sut.listCustomers(ctx, {});

    expect(page.items).toHaveLength(50);
    expect(page.totalItems).toBe(120);
    expect(page.hasMore).toBe(true);
    expect(readPage(page.nextCursor)).toBe(2);
  });

  it('closes the page when fewer records than the page size arrive', async () => {
    const { sut } = provider([{ json: { items: [], total_items: 0 } }]);
    const page = await sut.listCustomers(ctx, {});

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('forwards the requested page to the upstream query', async () => {
    const { stub, sut } = provider([{ json: { items: [], total_items: 0 } }]);
    await sut.listCustomers(ctx, { cursor: Buffer.from(JSON.stringify({ page: 3 })).toString('base64url'), limit: 25 });

    expect(stub.calls[0].url).toContain('pagina=3');
    expect(stub.calls[0].url).toContain('tamanho_pagina=25');
  });
});

describe('ContaAzulProvider token refresh', () => {
  it('refreshes on 401 and replays the request, including binary', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const refreshCredential = vi.fn(async () => ({ accessToken: 'renewed-token' }));
    const { stub, sut } = provider([{ status: 401 }, { buffer: pdf }], { refreshCredential });

    const result = await sut.getSalePdf(ctx, '42');

    expect(refreshCredential).toHaveBeenCalledTimes(1);
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[0].auth).toBe('Bearer live-token');
    expect(stub.calls[1].auth).toBe('Bearer renewed-token');
    expect(stub.calls[1].url).toBe('https://api-v2.contaazul.com/v1/venda/42/imprimir');
    expect(new Uint8Array(result)).toEqual(pdf);
  });

  it('refreshes on the JSON path too', async () => {
    const refreshCredential = vi.fn(async () => ({ accessToken: 'renewed-token' }));
    const { stub, sut } = provider([{ status: 401 }, { json: [] }], { refreshCredential });

    await sut.listSellers(ctx, {});

    expect(refreshCredential).toHaveBeenCalledTimes(1);
    expect(stub.calls[1].auth).toBe('Bearer renewed-token');
  });

  it('does not refresh when the call succeeds', async () => {
    const refreshCredential = vi.fn();
    const { stub, sut } = provider([{ json: [] }], { refreshCredential });

    await sut.listSellers(ctx, {});

    expect(refreshCredential).not.toHaveBeenCalled();
    expect(stub.calls).toHaveLength(1);
  });

  it('only refreshes once, then surfaces the failure', async () => {
    const refreshCredential = vi.fn(async () => ({ accessToken: 'still-bad' }));
    const { stub, sut } = provider([{ status: 401 }], { refreshCredential });

    await expect(sut.listSellers(ctx, {})).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(refreshCredential).toHaveBeenCalledTimes(1);
    expect(stub.calls).toHaveLength(2);
  });
});

describe('BaseProvider early renewal', () => {
  const NOW = 1_700_000_000_000;
  const inMs = (ms: number) => new Date(NOW + ms);
  const renewedFor2h = { accessToken: 'renewed-token', expiresAt: inMs(7_200_000) };

  it('renews a token about to expire before using it', async () => {
    const refreshCredential = vi.fn(async () => renewedFor2h);
    const { stub, sut } = provider([{ json: [] }], { refreshCredential, now: () => NOW });

    await sut.listSellers({ ...ctx, expiresAt: inMs(30_000) }, {});

    expect(refreshCredential).toHaveBeenCalledTimes(1);
    // No doomed call with the old token first.
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].auth).toBe('Bearer renewed-token');
  });

  it('leaves a token with time to spare alone', async () => {
    const refreshCredential = vi.fn(async () => renewedFor2h);
    const { stub, sut } = provider([{ json: [] }], { refreshCredential, now: () => NOW });

    await sut.listSellers({ ...ctx, expiresAt: inMs(10 * 60_000) }, {});

    expect(refreshCredential).not.toHaveBeenCalled();
    expect(stub.calls[0].auth).toBe('Bearer live-token');
  });

  it('keeps using the renewed token for the rest of the operation', async () => {
    const refreshCredential = vi.fn(async () => renewedFor2h);
    const { stub, sut } = provider([{ status: 401 }, { json: [] }, { json: [] }], { refreshCredential, now: () => NOW });

    await sut.listSellers(ctx, {});
    await sut.listSellers(ctx, {});

    expect(refreshCredential).toHaveBeenCalledTimes(1);
    expect(stub.calls.map((c) => c.auth)).toEqual(['Bearer live-token', 'Bearer renewed-token', 'Bearer renewed-token']);
  });

  it('tells the refresher which token actually failed', async () => {
    // The refresher decides "already renewed elsewhere" by comparing tokens, so
    // it must be shown the one in use, not the one the request started with.
    const refreshCredential = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: 'renewed-1', expiresAt: inMs(7_200_000) })
      .mockResolvedValueOnce({ accessToken: 'renewed-2', expiresAt: inMs(7_200_000) });
    const { sut } = provider([{ status: 401 }, { json: [] }, { status: 401 }, { json: [] }], {
      refreshCredential,
      now: () => NOW,
    });

    await sut.listSellers(ctx, {});
    await sut.listSellers(ctx, {});

    expect(refreshCredential.mock.calls.map(([c]) => c.accessToken)).toEqual(['live-token', 'renewed-1']);
  });

  it('falls back to the current token when an early renewal fails', async () => {
    const refreshCredential = vi.fn(async () => {
      throw new Error('token endpoint unreachable');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { stub, sut } = provider([{ json: [] }], { refreshCredential, now: () => NOW });

    await sut.listSellers({ ...ctx, expiresAt: inMs(30_000) }, {});

    expect(stub.calls[0].auth).toBe('Bearer live-token');
    warn.mockRestore();
  });
});

describe('ContaAzulProvider guards', () => {
  it('rejects an empty bulk id list before calling the API', async () => {
    const { stub, sut } = provider([{ json: {} }]);

    await expect(sut.bulkDeleteSales(ctx, [])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(stub.calls).toHaveLength(0);
  });

  it('rejects non-string ids', async () => {
    const { sut } = provider([{ json: {} }]);
    await expect(sut.bulkDeleteSales(ctx, [1 as any])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('maps bulk results to the unified shape', async () => {
    const { sut } = provider([{ json: { atualizados: 3, ignorados: 1 } }]);
    expect(await sut.bulkDeleteSales(ctx, ['a', 'b'])).toEqual({ processedCount: 3, ignoredCount: 1 });
  });
});

describe('ContaAzulProvider passthrough', () => {
  it('proxies to the provider base URL', async () => {
    const { stub, sut } = provider([{ json: { ok: true } }]);

    const result = await sut.passthrough(ctx, { method: 'GET', path: '/pessoas', query: { pagina: '2' } });

    expect(stub.calls[0].url).toBe('https://api-v2.contaazul.com/v1/pessoas?pagina=2');
    expect(result.body).toEqual({ ok: true });
  });

  it('refuses to be pointed at another host', async () => {
    const { stub, sut } = provider([{ json: {} }]);

    await expect(sut.passthrough(ctx, { method: 'GET', path: '//evil.test/steal' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(stub.calls).toHaveLength(0);
  });
});
