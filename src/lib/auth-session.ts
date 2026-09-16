import crypto from 'crypto';
import { cookies } from 'next/headers';
import prisma from './prisma';
import { asRole, canManageTeam, type Role } from './dashboard/roles';
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

export interface DashboardAccount {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

/** The signed-in account, or null. A deleted account's cookie stops working here. */
export async function currentUser(): Promise<DashboardAccount | null> {
  const store = await cookies();
  const userId = await sessionSubject(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const user = await prisma.dashboardUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });

  // The role is normalized on the way in, so no caller has to deal with a value
  // the database accepted but this version of the code does not know.
  return user ? { ...user, role: asRole(user.role) } : null;
}

/**
 * Guard for server actions. The proxy protects page navigation, but actions are
 * their own POST endpoints and must check independently.
 *
 * Returns the account so callers can attribute what they do.
 */
export async function requireDashboardSession(): Promise<DashboardAccount> {
  const user = await currentUser();
  if (!user) {
    throw new Error('Unauthorized: this action requires an authenticated dashboard session.');
  }
  return user;
}

/**
 * Guard for the actions only an owner may run.
 *
 * Same shape as requireDashboardSession, so an action that needs the stronger
 * check is one word different and cannot silently forget it.
 */
export async function requireOwner(): Promise<DashboardAccount> {
  const user = await requireDashboardSession();
  if (!canManageTeam(user.role)) {
    throw new Error('Forbidden: this action requires an owner account.');
  }
  return user;
}
