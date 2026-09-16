import crypto from 'crypto';

/**
 * Password hashing for dashboard accounts.
 *
 * scrypt from Node's standard library: no dependency to audit, and memory-hard,
 * so a leaked hash cannot be attacked at GPU speed. The cost parameters and the
 * salt travel inside the stored string, which is what lets them be raised later
 * without invalidating existing hashes.
 */

const SCRYPT_COST = 16_384; // N
const SCRYPT_BLOCK_SIZE = 8; // r
const SCRYPT_PARALLELISM = 1; // p
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** scrypt needs to be told how much memory it may use: roughly 128 * N * r. */
const MAX_MEMORY = 256 * SCRYPT_COST * SCRYPT_BLOCK_SIZE;

export { PASSWORD_MIN_LENGTH } from './password-rules';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await derive(password, salt);

  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELISM,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Never throws: a stored value this cannot parse is a failed verification, not
 * a 500 that tells the caller something about the account.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, cost, blockSize, parallelism, saltB64, keyB64] = parts;
  const N = Number(cost);
  const r = Number(blockSize);
  const p = Number(parallelism);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(keyB64, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const candidate = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(
        password.normalize('NFKC'),
        salt,
        expected.length,
        { N, r, p, maxmem: 256 * N * r },
        (error, key) => (error ? reject(error) : resolve(key))
      );
    });

    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** Sign-in is case-insensitive, and a stray space in a pasted address is not an error. */
export function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

/** Deliberately permissive: the address only has to be routable, not beautiful. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
