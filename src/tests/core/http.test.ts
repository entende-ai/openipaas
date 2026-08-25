import { describe, it, expect, vi } from 'vitest';
import { httpRequest } from '@/lib/providers/core/http';
import { ProviderError, RateLimitError, TokenExpiredError } from '@/lib/providers/core/errors';
import { stubFetch, noSleep } from '../helpers';

const opts = (fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) => ({
  provider: 'TEST',
  fetchImpl,
  sleep: noSleep,
  random: () => 0.5,
  ...extra,
});

describe('httpRequest', () => {
  it('returns parsed JSON on success', async () => {
    const stub = stubFetch([{ json: { hello: 'world' } }]);
    const { status, body } = await httpRequest({ method: 'GET', url: 'https://x.test/a' }, opts(stub.fetch));

    expect(status).toBe(200);
    expect(body).toEqual({ hello: 'world' });
    expect(stub.calls).toHaveLength(1);
  });

  it('returns null for an empty body', async () => {
    const stub = stubFetch([{ status: 204, text: '' }]);
    const { body } = await httpRequest({ method: 'DELETE', url: 'https://x.test/a' }, opts(stub.fetch));
    expect(body).toBeNull();
  });

  it('surfaces non-JSON bodies without throwing', async () => {
    const stub = stubFetch([{ text: 'plain text' }]);
    const { body } = await httpRequest({ method: 'GET', url: 'https://x.test/a' }, opts(stub.fetch));
    expect(body).toEqual({ raw: 'plain text' });
  });

  it('maps 401 to TokenExpiredError and does NOT retry it', async () => {
    const stub = stubFetch([{ status: 401 }, { json: { ok: true } }]);

    await expect(httpRequest({ method: 'GET', url: 'https://x.test/a' }, opts(stub.fetch))).rejects.toBeInstanceOf(
      TokenExpiredError
    );
    // Retrying with the same dead token would be pointless; refresh is the caller's job.
    expect(stub.calls).toHaveLength(1);
  });

  it('retries 5xx and succeeds on a later attempt', async () => {
    const stub = stubFetch([{ status: 500 }, { status: 500 }, { json: { ok: true } }]);
    const { body } = await httpRequest({ method: 'GET', url: 'https://x.test/a' }, opts(stub.fetch));

    expect(body).toEqual({ ok: true });
    expect(stub.calls).toHaveLength(3);
  });

  it('gives up after maxAttempts', async () => {
    const stub = stubFetch([{ status: 503 }]);

    await expect(
      httpRequest({ method: 'GET', url: 'https://x.test/a' }, opts(stub.fetch, { maxAttempts: 2 }))
    ).rejects.toBeInstanceOf(ProviderError);
    expect(stub.calls).toHaveLength(2);
  });

  it('retries 429 and honours Retry-After', async () => {
    const slept: number[] = [];
    const stub = stubFetch([{ status: 429, headers: { 'Retry-After': '2' } }, { json: { ok: true } }]);

    await httpRequest(
      { method: 'GET', url: 'https://x.test/a' },
      opts(stub.fetch, { sleep: async (ms: number) => { slept.push(ms); } })
    );

    expect(slept).toEqual([2000]);
    expect(stub.calls).toHaveLength(2);
  });

  it('does not retry 4xx client errors', async () => {
    const stub = stubFetch([{ status: 400, text: 'bad field' }]);

    await expect(httpRequest({ method: 'POST', url: 'https://x.test/a' }, opts(stub.fetch))).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(stub.calls).toHaveLength(1);
  });

  it('maps 404 to NOT_FOUND', async () => {
    const stub = stubFetch([{ status: 404 }]);
    await expect(httpRequest({ method: 'GET', url: 'https://x.test/a' }, opts(stub.fetch))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('never puts the upstream body in the public message', async () => {
    const secret = 'internal-stack-trace-with-customer-data';
    const stub = stubFetch([{ status: 500, text: secret }]);

    const error: ProviderError = await httpRequest(
      { method: 'GET', url: 'https://x.test/a' },
      opts(stub.fetch, { maxAttempts: 1 })
    ).then(() => { throw new Error('expected a rejection'); }, (e) => e as ProviderError);

    expect(error.publicMessage).not.toContain(secret);
    expect(error.details).toContain(secret); // still available for logs
  });

  it('turns an aborted request into UPSTREAM_TIMEOUT', async () => {
    const abort = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });

    await expect(
      httpRequest({ method: 'GET', url: 'https://x.test/a' }, opts(abort as any, { maxAttempts: 1 }))
    ).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
  });

  it('backs off with jitter between retries', async () => {
    const slept: number[] = [];
    const stub = stubFetch([{ status: 500 }, { status: 500 }, { json: {} }]);

    await httpRequest(
      { method: 'GET', url: 'https://x.test/a' },
      opts(stub.fetch, { sleep: async (ms: number) => { slept.push(ms); }, random: () => 1, baseDelayMs: 100 })
    );

    // Full-jitter with random()=1 yields the full exponential window.
    expect(slept).toEqual([100, 200]);
  });

  it('exposes retryAfterMs on RateLimitError', () => {
    const err = new RateLimitError('TEST', 1500);
    expect(err.retryAfterMs).toBe(1500);
    expect(err.status).toBe(429);
    expect(err.retryable).toBe(true);
  });
});
