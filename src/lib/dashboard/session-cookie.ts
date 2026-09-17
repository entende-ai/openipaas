/**
 * Starting a signed-in session, in one place.
 *
 * Sign-in, first-account setup, operator recovery and the emailed reset link
 * all end the same way: a cookie with the same flags and the same lifetime. It
 * lives here rather than in an action file because a "use server" module can
 * only export actions, and this is not one.
 */

import { cookies } from 'next/headers';
import { SESSION_COOKIE, issueSessionToken } from '@/lib/auth-session';

export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export async function startSessionCookie(userId: string): Promise<void> {
  const store = await cookies();

  store.set(SESSION_COOKIE, await issueSessionToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Only same-origin paths, so the parameter cannot be used as an open redirect. */
export function safeNext(next: string | null | undefined): string {
  const value = (next || '').toString();
  return value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard/clients';
}
