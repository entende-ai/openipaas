import { formatDuration } from './connections';

/**
 * What a console account is allowed to do.
 *
 * Two roles, because two is what the deployment actually needs: whoever set it
 * up, and colleagues who work in it. Everything here is a pure function of the
 * role so the rules can be read in one place and tested without a session.
 *
 * Scope on purpose: every account still sees every client. Restricting who sees
 * which customer is issue #32 and #33, and pretending to do it here with a
 * check in one screen would be worse than not doing it.
 */

export const ROLES = ['OWNER', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = 'MEMBER';

/** Anything not recognized is treated as the least privileged role. */
export function asRole(value: string | null | undefined): Role {
  return (ROLES as readonly string[]).includes(value ?? '') ? (value as Role) : DEFAULT_ROLE;
}

export function isOwner(role: string | null | undefined): boolean {
  return asRole(role) === 'OWNER';
}

/** Creating accounts, changing roles, removing people. */
export function canManageTeam(role: string | null | undefined): boolean {
  return isOwner(role);
}

/**
 * Revoking a key and disconnecting an account cannot be undone from the
 * console: the key is gone for whoever was using it, and the connection has to
 * be authorized again by the end customer.
 */
export function canDestroy(role: string | null | undefined): boolean {
  return isOwner(role);
}

/** Reading a connected account's token, which is a live credential. */
export function canRevealAccountToken(role: string | null | undefined): boolean {
  return isOwner(role);
}

export function roleLabel(role: string | null | undefined): string {
  return isOwner(role) ? 'Owner' : 'Member';
}

/**
 * A deployment must keep someone who can manage it.
 *
 * Refusing the last owner's removal or demotion is what stops a console from
 * becoming unadministrable, which no amount of DASHBOARD_PASSWORD fixes once
 * several people have accounts.
 */
export function wouldLeaveNoOwner(
  users: { id: string; role: string }[],
  change: { userId: string; to: Role | 'REMOVED' }
): boolean {
  const remaining = users.filter((user) => {
    if (user.id !== change.userId) return isOwner(user.role);
    return change.to === 'OWNER';
  });

  return remaining.length === 0;
}

/**
 * One line about an account, for the team list.
 *
 * Kept here rather than in the page because reading the clock during render is
 * exactly what React's purity rule forbids, and because "has never signed in"
 * is worth a test.
 */
export function lastSeen(lastLoginAt: Date | null | undefined, now: Date = new Date()): string {
  if (!lastLoginAt) return 'has never signed in';

  const elapsed = now.getTime() - lastLoginAt.getTime();
  // A clock skew between the database and the app should not print "in -3 minutes".
  return elapsed < 0 ? 'signed in just now' : `last signed in ${formatDuration(elapsed)} ago`;
}
