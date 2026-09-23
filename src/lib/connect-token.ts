/**
 * The token in a connect link, signed so the edge can read it.
 *
 * Two readers with different powers. The proxy has to know, before any page
 * renders, which origins may frame this page, and it runs in the Edge Runtime
 * with no database. The page itself has to know the session is real, unused and
 * unexpired, which only the database can say.
 *
 * So the token carries its own claims and an HMAC over them, and the row it
 * points at holds the truth. The signature is what the edge trusts; the row is
 * what everything else trusts. A token that passes the first and fails the
 * second is an expired or spent link, which is a normal thing to see.
 *
 * Web Crypto only, like session-token.ts, for the same reason.
 */

export interface ConnectClaims {
  /** ConnectSession id. */
  sid: string;
  /** Origins allowed to frame the page and receive its messages. */
  org: string[];
  /** Epoch milliseconds. */
  exp: number;
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

async function hmac(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return base64urlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Signed with the session secret, which every deployment already has.
 *
 * A second secret would be a second thing to configure and a second thing to
 * forget, and this one is already required for the console to work at all.
 */
function secretOrNull(): string | null {
  return (process.env.DASHBOARD_SESSION_SECRET || '').trim() || null;
}

export function connectSecretConfigured(): boolean {
  return secretOrNull() !== null;
}

/**
 * The token, and the random part the database stores a hash of.
 *
 * The nonce is what makes two sessions created in the same millisecond, for the
 * same client, with the same claims, different tokens.
 */
export async function mintConnectToken(claims: ConnectClaims): Promise<string> {
  const secret = secretOrNull();
  if (!secret) throw new Error('DASHBOARD_SESSION_SECRET is not configured; connect links cannot be signed.');

  const nonce = base64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
  const encoded = base64urlEncode(new TextEncoder().encode(JSON.stringify({ ...claims, n: nonce })));

  return `${encoded}.${await hmac(secret, encoded)}`;
}

/**
 * The claims of a token whose signature checks out, or null.
 *
 * Signature first, always: until the HMAC agrees, everything in the payload is
 * whatever the caller felt like sending, including the list of origins allowed
 * to frame the page.
 */
export async function readConnectToken(token: string | undefined | null): Promise<ConnectClaims | null> {
  const secret = secretOrNull();
  if (!secret || !token) return null;

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  if (!safeCompare(signature, await hmac(secret, encoded))) return null;

  try {
    const { sid, org, exp } = JSON.parse(base64urlDecode(encoded));
    if (typeof sid !== 'string' || !sid) return null;
    if (typeof exp !== 'number' || exp <= Date.now()) return null;

    return { sid, org: Array.isArray(org) ? org.filter((entry) => typeof entry === 'string') : [], exp };
  } catch {
    return null;
  }
}

/**
 * The frame-ancestors value for a page opened with this token.
 *
 * `'none'` when the session named no origin, which is the right default: a page
 * that can be framed by anyone is a page that can be framed inside a fake one.
 */
export function frameAncestorsFor(origins: string[]): string {
  const clean = origins.filter((origin) => /^https?:\/\/[^\s'";]+$/.test(origin));
  return clean.length > 0 ? clean.join(' ') : "'none'";
}
