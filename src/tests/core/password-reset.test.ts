import { describe, it, expect } from 'vitest';
import {
  createResetToken,
  hashResetToken,
  resetTokenExpiry,
  resetTokenProblem,
  canRequestAnother,
  resetLink,
  resetEmail,
  RESET_TOKEN_TTL_MINUTES,
  RESET_REQUEST_COOLDOWN_SECONDS,
} from '@/lib/password-reset';

/**
 * The parts of a reset link that can be reasoned about without a database.
 *
 * The token is the credential. What matters here is that it is unguessable,
 * that only its hash is ever meant to be stored, that a link stops working, and
 * that the message carries no markup somebody typed into a name field.
 */

describe('the token', () => {
  it('is 32 random bytes in url-safe characters', () => {
    const token = createResetToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 100 }, () => createResetToken())).size).toBe(100);
  });

  // What is stored has to be one way, or a dump of the table is a set of links.
  it('is stored as a sha256, which the token cannot be read back out of', () => {
    const token = createResetToken();
    const hash = hashResetToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashResetToken(token)).toBe(hash);
    expect(hashResetToken(createResetToken())).not.toBe(hash);
  });

  it('expires an hour out', () => {
    const now = new Date('2026-09-17T10:00:00Z');
    expect(resetTokenExpiry(now).toISOString()).toBe('2026-09-17T11:00:00.000Z');
    expect(RESET_TOKEN_TTL_MINUTES).toBe(60);
  });
});

describe('whether a link still works', () => {
  const now = new Date('2026-09-17T10:00:00Z');
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it('works while it is unused and unexpired', () => {
    expect(resetTokenProblem({ expiresAt: later(30), usedAt: null }, now)).toBeNull();
  });

  it('refuses one that was never real', () => {
    expect(resetTokenProblem(null, now)).toBe('unknown');
  });

  it('refuses a second use', () => {
    expect(resetTokenProblem({ expiresAt: later(30), usedAt: later(-5) }, now)).toBe('used');
  });

  it('refuses one that has run out, including exactly on the second', () => {
    expect(resetTokenProblem({ expiresAt: later(-1), usedAt: null }, now)).toBe('expired');
    expect(resetTokenProblem({ expiresAt: now, usedAt: null }, now)).toBe('expired');
  });

  // Used beats expired only in the database; the screen says the same either way.
  it('prefers used over expired when both are true', () => {
    expect(resetTokenProblem({ expiresAt: later(-10), usedAt: later(-20) }, now)).toBe('used');
  });
});

describe('asking for another link', () => {
  const now = new Date('2026-09-17T10:00:00Z');

  it('allows the first one', () => {
    expect(canRequestAnother(null, now)).toBe(true);
  });

  it('holds off inside the cooldown', () => {
    expect(canRequestAnother(new Date(now.getTime() - 5_000), now)).toBe(false);
    expect(canRequestAnother(new Date(now.getTime() - RESET_REQUEST_COOLDOWN_SECONDS * 1000 + 1), now)).toBe(false);
  });

  it('allows one after it', () => {
    expect(canRequestAnother(new Date(now.getTime() - RESET_REQUEST_COOLDOWN_SECONDS * 1000), now)).toBe(true);
  });
});

describe('the link', () => {
  it('points at the reset page', () => {
    expect(resetLink('https://app.openipaas.com', 'abc')).toBe('https://app.openipaas.com/reset/abc');
  });

  it('survives a trailing slash in the configured url', () => {
    expect(resetLink('https://app.openipaas.com//', 'abc')).toBe('https://app.openipaas.com/reset/abc');
  });
});

describe('the message', () => {
  const link = 'https://app.openipaas.com/reset/tok-1';

  it('carries the link in both parts', () => {
    const message = resetEmail(link, 'Fabio');

    expect(message.subject).toContain('password');
    expect(message.text).toContain(link);
    expect(message.text).toContain('Hi Fabio,');
    expect(message.html).toContain(`href="${link}"`);
  });

  it('says what the link is worth', () => {
    expect(resetEmail(link).text).toContain(`${RESET_TOKEN_TTL_MINUTES} minutes`);
    expect(resetEmail(link).text).toContain('ignore this message');
  });

  it('greets an account with no name without saying undefined', () => {
    expect(resetEmail(link, null).text).toContain('Hi,');
    expect(resetEmail(link, null).text).not.toContain('undefined');
  });

  // The name comes from a form an owner filled in, and lands in an email client.
  it('escapes a name that is markup', () => {
    const message = resetEmail(link, '<img src=x onerror=alert(1)>');

    expect(message.html).not.toContain('<img');
    expect(message.html).toContain('&lt;img');
  });
});
