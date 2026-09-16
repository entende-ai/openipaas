import crypto from 'crypto';
import { cookies } from 'next/headers';
import prisma from './prisma';
import { SESSION_COOKIE, issueSessionToken, sessionSubject, verifySessionToken } from './session-token';

/**
 * Node-side dashboard session helpers.
 *
 * Signing and verification live in session-token.ts so middleware can reuse them
 * in the Edge Runtime; this module adds the parts that need Node and cookies.
 *
 * Scope: named accounts sign in with email and password. DASHBOARD_PASSWORD is
 * no longer how anyone signs in; it is the operator secret that authorizes
 * creating the first account and resetting a forgotten password, which is what
 * a deployment with no mail server can offer.
 */

export { SESSION_COOKIE, issueSessionToken, sessionSubject, verifySessionToken };

export function isDashboardAuthConfigured(): boolean {
  return Boolean((process.env.DASHBOARD_PASSWORD || '').trim() && (process.env.DASHBOARD_SESSION_SECRET || '').trim());
}

/** The operator secret from the environment, not any account's password. */
export function checkOperatorPassword(candidate: string): boolean {
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

/** The signed-in account, or null. A deleted account's cookie stops working here. */
export async function currentUser(): Promise<{ id: string; email: string; name: string | null } | null> {
  const store = await cookies();
  const userId = await sessionSubject(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  return prisma.dashboardUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
}

/**
 * Guard for server actions. The proxy protects page navigation, but actions are
 * their own POST endpoints and must check independently.
 *
 * Returns the account so callers can attribute what they do.
 */
export async function requireDashboardSession(): Promise<{ id: string; email: string; name: string | null }> {
  const user = await currentUser();
  if (!user) {
    throw new Error('Unauthorized: this action requires an authenticated dashboard session.');
  }
  return user;
}
