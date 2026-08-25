import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';

/**
 * Gates the admin dashboard behind a signed session cookie.
 *
 * Named `proxy` because Next.js 16 deprecated the `middleware` file convention
 * and renamed it (see node_modules/next/dist/docs/.../proxy.md).
 *
 * Imports the Web Crypto-only token module: this runs in the Edge Runtime,
 * where Node built-ins are unavailable. Verification is signature-only, so it
 * costs no database round trip. Server actions re-check independently.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: '/dashboard/:path*',
};
