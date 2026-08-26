import crypto from 'crypto';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, issueSessionToken, verifySessionToken } from './session-token';

/**
 * Node-side dashboard session helpers.
 *
 * Signing and verification live in session-token.ts so middleware can reuse them
 * in the Edge Runtime; this module adds the parts that need Node and cookies.
 *
 * Scope: one shared operator password for the internal console. Customer-facing
 * accounts need a real identity provider, but this replaces a dashboard that
 * had no authentication at all.
 */

export { SESSION_COOKIE, issueSessionToken, verifySessionToken };

export function isDashboardAuthConfigured(): boolean {
  return Boolean((process.env.DASHBOARD_PASSWORD || '').trim() && (process.env.DASHBOARD_SESSION_SECRET || '').trim());
}

export function checkPassword(candidate: string): boolean {
  const expected = (process.env.DASHBOARD_PASSWORD || '').trim();
  if (!expected) return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function hasDashboardSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Guard for server actions. Middleware protects page navigation, but actions are
 * their own POST endpoints and must check independently.
 */
export async function requireDashboardSession(): Promise<void> {
  if (!(await hasDashboardSession())) {
    throw new Error('Unauthorized: this action requires an authenticated dashboard session.');
  }
}
