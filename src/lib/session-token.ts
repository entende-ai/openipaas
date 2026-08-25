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

export async function issueSessionToken(): Promise<string> {
  const secret = secretOrNull();
  if (!secret) {
    throw new Error('DASHBOARD_SESSION_SECRET is not configured; the dashboard cannot issue sessions.');
  }

  const payload = JSON.stringify({ sub: 'admin', exp: Date.now() + SESSION_TTL_MS });
  const encoded = base64urlEncode(new TextEncoder().encode(payload));
  return `${encoded}.${await hmac(secret, encoded)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const secret = secretOrNull();
  if (!secret || !token) return false;

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return false;

  if (!safeCompare(signature, await hmac(secret, encoded))) return false;

  try {
    const { exp } = JSON.parse(base64urlDecode(encoded));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}
