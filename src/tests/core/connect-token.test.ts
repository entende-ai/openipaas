import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * The token in a connect link.
 *
 * It is read in two places with very different powers, and the dangerous one is
 * the edge: the proxy takes the list of origins allowed to frame the page
 * straight out of the payload, before any database says whether the session is
 * real. So the only thing standing between a stranger and a page framed inside
 * their own site is the signature. These tests are mostly about that.
 */

const SECRET = 'connect-token-test-secret';

const { mintConnectToken, readConnectToken, frameAncestorsFor, connectSecretConfigured } = await import(
  '@/lib/connect-token'
);

const original = process.env.DASHBOARD_SESSION_SECRET;

beforeEach(() => {
  process.env.DASHBOARD_SESSION_SECRET = SECRET;
});

afterEach(() => {
  process.env.DASHBOARD_SESSION_SECRET = original;
});

const claims = (overrides: Partial<{ sid: string; org: string[]; exp: number }> = {}) => ({
  sid: 'session-1',
  org: ['https://app.example.com'],
  exp: Date.now() + 60_000,
  ...overrides,
});

describe('minting and reading', () => {
  it('reads back the claims it signed', async () => {
    const token = await mintConnectToken(claims());

    const read = await readConnectToken(token);

    expect(read?.sid).toBe('session-1');
    expect(read?.org).toEqual(['https://app.example.com']);
  });

  it('gives two different tokens for the same claims', async () => {
    const same = claims();

    expect(await mintConnectToken(same)).not.toBe(await mintConnectToken(same));
  });

  it('refuses to sign when the secret is missing', async () => {
    delete process.env.DASHBOARD_SESSION_SECRET;

    await expect(mintConnectToken(claims())).rejects.toThrow(/DASHBOARD_SESSION_SECRET/);
    expect(connectSecretConfigured()).toBe(false);
  });
});

describe('what a reader refuses', () => {
  it('refuses a payload whose signature was not recomputed', async () => {
    const token = await mintConnectToken(claims());
    const [encoded, signature] = token.split('.');

    // The attack this exists for: keep the signature, swap in an origin list
    // that names your own site.
    const forged = Buffer.from(
      JSON.stringify({ sid: 'session-1', org: ['https://evil.example'], exp: Date.now() + 60_000 })
    )
      .toString('base64url');

    expect(await readConnectToken(`${forged}.${signature}`)).toBeNull();
    expect((await readConnectToken(`${encoded}.${signature}`))?.org).toEqual(['https://app.example.com']);
  });

  it('refuses a token signed with another secret', async () => {
    const token = await mintConnectToken(claims());
    process.env.DASHBOARD_SESSION_SECRET = 'a-different-secret';

    expect(await readConnectToken(token)).toBeNull();
  });

  it('refuses an expired token without asking the database', async () => {
    const token = await mintConnectToken(claims({ exp: Date.now() - 1 }));

    expect(await readConnectToken(token)).toBeNull();
  });

  it('refuses nothing, half a token, and junk', async () => {
    expect(await readConnectToken(undefined)).toBeNull();
    expect(await readConnectToken('')).toBeNull();
    expect(await readConnectToken('only-one-part')).toBeNull();
    expect(await readConnectToken('not.base64url')).toBeNull();
  });
});

describe('frame ancestors', () => {
  it('is none when the session named no origin', () => {
    expect(frameAncestorsFor([])).toBe("'none'");
  });

  it('lists the origins it was given', () => {
    expect(frameAncestorsFor(['https://a.example', 'https://b.example'])).toBe('https://a.example https://b.example');
  });

  // The value goes into a response header. An origin carrying a quote or a
  // semicolon could end the directive and start another one.
  it('drops anything that could break out of the directive', () => {
    expect(frameAncestorsFor(["https://a.example'; script-src *"])).toBe("'none'");
    expect(frameAncestorsFor(['javascript:alert(1)'])).toBe("'none'");
    expect(frameAncestorsFor(['*'])).toBe("'none'");
  });
});
