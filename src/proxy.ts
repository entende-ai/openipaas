import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';
import { frameAncestorsFor, readConnectToken } from '@/lib/connect-token';

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

  if (pathname.startsWith('/connect')) {
    return connectPage(request, pathname);
  }

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

/**
 * Who may put the hosted connect page in an iframe.
 *
 * It has to be decided here, before the page renders, and it differs per
 * session: the product that created the session named its own origin, and
 * nobody else's page has any business framing a screen where a customer types
 * provider credentials.
 *
 * The origins ride in the signed token exactly because this runs in the Edge
 * Runtime, where there is no database to ask. A token that does not verify gets
 * `'none'`, so a forged link cannot widen anything.
 */
async function connectPage(request: NextRequest, pathname: string) {
  const response = NextResponse.next();

  // `/connect/<token>` and everything under it. `/connect/done` is ours and
  // carries no token, so it stays unframeable.
  const token = pathname.split('/')[2] ?? '';
  const claims = token && token !== 'done' ? await readConnectToken(token) : null;

  response.headers.set('Content-Security-Policy', `frame-ancestors ${frameAncestorsFor(claims?.org ?? [])}`);
  // Deliberately not X-Frame-Options: it cannot express a list, and a browser
  // that honours both would take the stricter one and break the iframe the
  // session explicitly allowed.
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/connect/:path*'],
};
