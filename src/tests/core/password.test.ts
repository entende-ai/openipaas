import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, normalizeEmail, looksLikeEmail } from '@/lib/password';

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const stored = await hashPassword('a-decent-password');
    expect(await verifyPassword('a-decent-password', stored)).toBe(true);
  });

  it('rejects the wrong password, including a prefix of the right one', async () => {
    const stored = await hashPassword('a-decent-password');

    expect(await verifyPassword('a-decent-passwor', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
    expect(await verifyPassword('A-Decent-Password', stored)).toBe(false);
  });

  it('salts, so the same password never produces the same hash', async () => {
    const first = await hashPassword('a-decent-password');
    const second = await hashPassword('a-decent-password');

    expect(first).not.toBe(second);
    expect(await verifyPassword('a-decent-password', second)).toBe(true);
  });

  it('stores the parameters it used, so they can be raised later', async () => {
    const stored = await hashPassword('a-decent-password');
    const [scheme, cost, blockSize, parallelism, salt, key] = stored.split('$');

    expect(scheme).toBe('scrypt');
    expect(Number(cost)).toBeGreaterThanOrEqual(16_384);
    expect(Number(blockSize)).toBe(8);
    expect(Number(parallelism)).toBe(1);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
  });

  it('never leaks the password into the stored value', async () => {
    expect(await hashPassword('hunter2-hunter2')).not.toContain('hunter2');
  });

  // A stored value this cannot parse is a failed sign-in, not a 500 that tells
  // the caller their account exists but is somehow special.
  it('returns false instead of throwing on a malformed stored value', async () => {
    for (const junk of ['', 'not-a-hash', 'scrypt$x$8$1$AAAA$AAAA', 'scrypt$16384$8$1$$', 'bcrypt$16384$8$1$AA$AA']) {
      expect(await verifyPassword('a-decent-password', junk)).toBe(false);
    }
  });

  it('treats the same characters typed in different Unicode forms as equal', async () => {
    // Composed vs decomposed "é": the same password to a person.
    const stored = await hashPassword('café-com-leite');
    expect(await verifyPassword('café-com-leite', stored)).toBe(true);
  });
});

describe('email handling', () => {
  it('signs in case-insensitively and forgives pasted whitespace', () => {
    expect(normalizeEmail('  Tech@Entende.AI ')).toBe('tech@entende.ai');
  });

  it('accepts routable addresses and rejects the obviously broken', () => {
    expect(looksLikeEmail('tech@entende.ai')).toBe(true);
    expect(looksLikeEmail('a+tag@sub.domain.com.br')).toBe(true);
    expect(looksLikeEmail('tech@entende')).toBe(false);
    expect(looksLikeEmail('not an email')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});
