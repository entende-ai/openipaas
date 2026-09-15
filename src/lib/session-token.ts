/**
 * Session token signing and verification, using only Web Crypto.
 *
 * Kept free of Node built-ins on purpose: middleware runs in the Edge Runtime,
 * where importing `crypto` or `next/headers` fails. Node-side concerns (cookies,
 * password check) live in auth-session.ts, which builds on this.
 */

export const SESSION_COOKIE = 'openipaas_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64urlEncode(new Uint8Array(signature));
}

/** Length-independent, constant-time comparison. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secretOrNull(): string | null {
  return (process.env.DASHBOARD_SESSION_SECRET || '').trim() || null;
}

/**
 * `subject` is the DashboardUser id, so the console can tell who is signed in
 * without a database round trip in the proxy.
 */
export async function issueSessionToken(subject: string): Promise<string> {
  const secret = secretOrNull();
  if (!secret) {
    throw new Error('DASHBOARD_SESSION_SECRET is not configured; the dashboard cannot issue sessions.');
  }
  if (!subject) {
    throw new Error('A session token needs a subject.');
  }

  const payload = JSON.stringify({ sub: subject, exp: Date.now() + SESSION_TTL_MS });
  const encoded = base64urlEncode(new TextEncoder().encode(payload));
  return `${encoded}.${await hmac(secret, encoded)}`;
}

/**
 * Returns the subject of a valid, unexpired token, or null.
 *
 * Signature first, always: the payload is attacker-controlled until the HMAC
 * says otherwise, so nothing inside it is read before that check passes.
 */
export async function sessionSubject(token: string | undefined | null): Promise<string | null> {
  const secret = secretOrNull();
  if (!secret || !token) return null;

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  if (!safeCompare(signature, await hmac(secret, encoded))) return null;

  try {
    const { sub, exp } = JSON.parse(base64urlDecode(encoded));
    if (typeof exp !== 'number' || exp <= Date.now()) return null;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  return (await sessionSubject(token)) !== null;
}
