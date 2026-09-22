import crypto from 'crypto';

/**
 * Envelope encryption for stored ERP credentials (AES-256-GCM).
 *
 * Ciphertexts are tagged with a version prefix so plaintext rows written before
 * encryption existed still decrypt: `decrypt` returns unprefixed input as-is.
 * That is what lets the column be migrated in place, without downtime.
 */

const PREFIX = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer | null {
  if (cachedKey) return cachedKey;

  const raw = (process.env.CREDENTIALS_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;

  // Accept base64 or hex, so operators can paste either format.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (256 bits).');
  }

  cachedKey = key;
  return cachedKey;
}

/** Test seam: forces the key to be re-read from the environment. */
export function __resetKeyCache() {
  cachedKey = null;
}

export function isEncryptionConfigured(): boolean {
  return loadKey() !== null;
}

export function encrypt(plaintext: string): string {
  const key = loadKey();

  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY is required in production: refusing to store ERP credentials in plaintext.'
      );
    }
    // Local development without a key: store as-is so the app still boots.
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decrypt(payload: string): string {
  if (!payload?.startsWith(`${PREFIX}:`)) {
    // Written before encryption was enabled.
    return payload;
  }

  const key = loadKey();
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set, but an encrypted credential was found.');
  }

  const [, ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted credential.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export function encryptNullable(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : encrypt(value);
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : decrypt(value);
}

/* ------------------------------------------------------------------ *
 * API keys
 * ------------------------------------------------------------------ */

/**
 * API keys are stored as a SHA-256 digest. The lookup stays a single indexed
 * equality check, and a database dump no longer hands over usable keys.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

export function generateApiKeyValue(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `oip_live_${crypto.randomBytes(24).toString('hex')}`;
  return { plaintext, hash: hashApiKey(plaintext), prefix: plaintext.slice(0, 16) };
}

/**
 * An admin key, which crosses clients and so is a different kind of thing.
 *
 * The prefix differs on purpose: the two are never interchangeable, and one
 * pasted where the other belongs should be recognisable in a log line and in a
 * support conversation without anyone holding the secret up to the light.
 */
export function generateAdminKeyValue(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `oip_admin_${crypto.randomBytes(24).toString('hex')}`;
  return { plaintext, hash: hashApiKey(plaintext), prefix: plaintext.slice(0, 17) };
}

/** Constant-time compare, for anything that must not leak length/position. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
