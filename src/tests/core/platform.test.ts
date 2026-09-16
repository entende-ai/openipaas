import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signPayload, verifySignature, nextAttemptDelayMs } from '@/lib/webhooks';
import {
  checkOperatorPassword,
  isDashboardAuthConfigured,
  issueSessionToken,
  sessionSubject,
  verifySessionToken,
} from '@/lib/auth-session';
import { redirectUriFor, slugFromCallbackSegment } from '@/lib/oauth';

describe('webhook signatures', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ type: 'sale.created', data: { id: '1' } });

  it('verifies a signature it produced', () => {
    const timestamp = String(Date.now());
    const signature = signPayload(secret, timestamp, body);

    expect(verifySignature({ secret, timestamp, body, signature })).toBe(true);
  });

  it('rejects a tampered body', () => {
    const timestamp = String(Date.now());
    const signature = signPayload(secret, timestamp, body);

    expect(verifySignature({ secret, timestamp, body: body + ' ', signature })).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const timestamp = String(Date.now());
    const signature = signPayload('other-secret', timestamp, body);

    expect(verifySignature({ secret, timestamp, body, signature })).toBe(false);
  });

  it('rejects a replayed delivery outside the tolerance window', () => {
    const old = String(Date.now() - 10 * 60 * 1000);
    const signature = signPayload(secret, old, body);

    // Signature is valid, but the timestamp is signed too, so it cannot be refreshed.
    expect(verifySignature({ secret, timestamp: old, body, signature })).toBe(false);
  });

  it('backs off further on each attempt and caps out', () => {
    const delays = [1, 2, 3, 4, 5, 6].map(nextAttemptDelayMs);

    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
    expect(delays.at(-1)).toBeLessThanOrEqual(12 * 60 * 60 * 1000);
  });
});

describe('dashboard session', () => {
  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = 'test-session-secret';
    process.env.DASHBOARD_PASSWORD = 'correct-horse';
  });
  afterEach(() => {
    delete process.env.DASHBOARD_SESSION_SECRET;
    delete process.env.DASHBOARD_PASSWORD;
  });

  it('reports whether auth is configured', () => {
    expect(isDashboardAuthConfigured()).toBe(true);
    delete process.env.DASHBOARD_PASSWORD;
    expect(isDashboardAuthConfigured()).toBe(false);
  });

  it('round-trips a token it issued', async () => {
    expect(await verifySessionToken(await issueSessionToken('user-1'))).toBe(true);
  });

  it('rejects junk, empty and missing tokens', async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken('')).toBe(false);
    expect(await verifySessionToken('not-a-token')).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await issueSessionToken('user-1');
    process.env.DASHBOARD_SESSION_SECRET = 'a-different-secret';

    expect(await verifySessionToken(token)).toBe(false);
  });

  it('rejects a forged payload with a stale signature', async () => {
    const [, signature] = (await issueSessionToken('user-1')).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + 999999 }), 'utf8').toString('base64url');

    expect(await verifySessionToken(`${forged}.${signature}`)).toBe(false);
  });

  it('rejects an expired token', async () => {
    const encoded = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() - 1000 }), 'utf8').toString('base64url');
    // Signed correctly, so only expiry can reject it.
    const crypto = await import('crypto');
    const signature = crypto.createHmac('sha256', 'test-session-secret').update(encoded).digest('base64url');

    expect(await verifySessionToken(`${encoded}.${signature}`)).toBe(false);
  });

  it('checks the operator password without throwing on a length mismatch', () => {
    expect(checkOperatorPassword('correct-horse')).toBe(true);
    expect(checkOperatorPassword('wrong')).toBe(false);
    expect(checkOperatorPassword('')).toBe(false);
  });

  it('carries the account id, so the console knows who is signed in', async () => {
    expect(await sessionSubject(await issueSessionToken('user-1'))).toBe('user-1');
  });

  it('refuses to issue a token with no subject', async () => {
    await expect(issueSessionToken('')).rejects.toThrow(/subject/);
  });
});

describe('oauth callback routing', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('builds a per-provider redirect uri', () => {
    expect(redirectUriFor('CONTA_AZUL')).toBe('https://app.example.com/api/oauth/callback/conta-azul');
  });

  it('round-trips slug and url segment', () => {
    for (const slug of ['CONTA_AZUL', 'OMIE', 'TINY']) {
      const segment = redirectUriFor(slug).split('/').pop()!;
      expect(slugFromCallbackSegment(segment)).toBe(slug);
    }
  });

  it('strips a trailing slash from the app url', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';
    expect(redirectUriFor('OMIE')).toBe('https://app.example.com/api/oauth/callback/omie');
  });
});
