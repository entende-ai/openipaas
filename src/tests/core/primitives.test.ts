import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { acquireSlot, __setClockForTests, __resetRateLimiter } from '@/lib/providers/core/rate-limit';
import { encodeCursor, decodeCursor, readPage, nextPageCursor } from '@/lib/providers/core/pagination';
import { normalizePassthroughPath } from '@/lib/providers/core/BaseProvider';
import { consume, __resetApiRateLimiter, __setClockForTests as setApiClock } from '@/lib/api-rate-limit';
import { encrypt, decrypt, hashApiKey, generateApiKeyValue, safeEqual, __resetKeyCache } from '@/lib/crypto';
import { hashRequest } from '@/lib/idempotency';

describe('provider rate limiter', () => {
  afterEach(() => __resetRateLimiter());

  it('lets a burst through without waiting', async () => {
    const clock = 0;
    __setClockForTests(() => clock);

    for (let i = 0; i < 5; i++) {
      expect(await acquireSlot('p:acct', { requestsPerSecond: 5, burst: 5 }, async () => {})).toBe(0);
    }
  });

  it('waits once the burst is spent', async () => {
    let clock = 0;
    __setClockForTests(() => clock);
    const sleep = async (ms: number) => { clock += ms; };

    await acquireSlot('p:acct2', { requestsPerSecond: 2, burst: 1 }, sleep);
    const waited = await acquireSlot('p:acct2', { requestsPerSecond: 2, burst: 1 }, sleep);

    // At 2 req/s a fresh token takes 500ms.
    expect(waited).toBe(500);
  });

  it('keys buckets independently per account', async () => {
    let clock = 0;
    __setClockForTests(() => clock);
    const sleep = async (ms: number) => { clock += ms; };

    await acquireSlot('p:a', { requestsPerSecond: 1, burst: 1 }, sleep);
    // A different account must not be charged for the first one.
    expect(await acquireSlot('p:b', { requestsPerSecond: 1, burst: 1 }, sleep)).toBe(0);
  });

  it('is a no-op when the manifest declares no limit', async () => {
    expect(await acquireSlot('p:none', undefined, async () => {})).toBe(0);
  });
});

describe('api rate limiter', () => {
  beforeEach(() => __resetApiRateLimiter());
  afterEach(() => __resetApiRateLimiter());

  it('allows up to the limit then rejects', () => {
    const clock = 1_000;
    setApiClock(() => clock);

    expect(consume('c1', 3, 60_000).allowed).toBe(true);
    expect(consume('c1', 3, 60_000).allowed).toBe(true);
    expect(consume('c1', 3, 60_000).allowed).toBe(true);

    const denied = consume('c1', 3, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    let clock = 1_000;
    setApiClock(() => clock);

    consume('c2', 1, 60_000);
    expect(consume('c2', 1, 60_000).allowed).toBe(false);

    clock += 60_001;
    expect(consume('c2', 1, 60_000).allowed).toBe(true);
  });
});

describe('pagination', () => {
  it('round-trips a cursor', () => {
    const cursor = encodeCursor({ page: 7 });
    expect(decodeCursor(cursor)).toEqual({ page: 7 });
    expect(readPage(cursor)).toBe(7);
  });

  it('is opaque, not a bare page number', () => {
    expect(encodeCursor({ page: 2 })).not.toBe('2');
  });

  it('defaults to page 1 without a cursor', () => {
    expect(readPage(undefined)).toBe(1);
    expect(readPage(null)).toBe(1);
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeCursor('!!!not-base64!!!')).toThrow(/malformed/i);
  });

  it('stops paging on a short page', () => {
    expect(nextPageCursor(1, 20, 50)).toBeNull();
  });

  it('stops paging once the total is covered', () => {
    expect(nextPageCursor(2, 50, 50, 100)).toBeNull();
  });

  it('advances while more records remain', () => {
    const next = nextPageCursor(1, 50, 50, 120);
    expect(next).not.toBeNull();
    expect(readPage(next)).toBe(2);
  });
});

describe('passthrough path safety', () => {
  it('accepts a normal relative path', () => {
    expect(normalizePassthroughPath('/pessoas', 'X')).toBe('/pessoas');
  });

  it.each([
    ['https://evil.test/steal', 'absolute URL'],
    ['//evil.test/steal', 'protocol-relative'],
    ['/../../etc/passwd', 'traversal'],
    ['pessoas', 'missing leading slash'],
    ['', 'empty'],
  ])('rejects %s (%s)', (path) => {
    expect(() => normalizePassthroughPath(path, 'X')).toThrow();
  });
});

describe('crypto', () => {
  const KEY = Buffer.alloc(32, 7).toString('base64');

  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY;
    __resetKeyCache();
  });
  afterEach(() => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    __resetKeyCache();
  });

  it('round-trips a secret', () => {
    const secret = 'ya29.super-secret-access-token';
    const sealed = encrypt(secret);

    expect(sealed).not.toContain(secret);
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(decrypt(sealed)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('reads legacy plaintext rows unchanged', () => {
    // Written before encryption existed; must still decrypt to itself.
    expect(decrypt('plain-legacy-token')).toBe('plain-legacy-token');
  });

  it('detects tampering via the GCM auth tag', () => {
    const sealed = encrypt('secret');
    const [v, iv, tag, data] = sealed.split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;

    expect(() => decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    __resetKeyCache();
    expect(() => encrypt('x')).toThrow(/32 bytes/);
  });

  it('hashes API keys deterministically and irreversibly', () => {
    const { plaintext, hash, prefix } = generateApiKeyValue();

    expect(hash).toBe(hashApiKey(plaintext));
    expect(hash).not.toContain(plaintext);
    expect(hash).toHaveLength(64);
    expect(plaintext.startsWith(prefix)).toBe(true);
  });

  it('compares in constant time without throwing on length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcdef')).toBe(false);
  });
});

describe('idempotency hashing', () => {
  it('is stable for the same endpoint and body', () => {
    expect(hashRequest('POST /sales', { a: 1 })).toBe(hashRequest('POST /sales', { a: 1 }));
  });

  it('differs when the body changes', () => {
    expect(hashRequest('POST /sales', { a: 1 })).not.toBe(hashRequest('POST /sales', { a: 2 }));
  });

  it('differs when the endpoint changes', () => {
    expect(hashRequest('POST /sales', { a: 1 })).not.toBe(hashRequest('POST /products', { a: 1 }));
  });
});
