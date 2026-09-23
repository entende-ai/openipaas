import { NextResponse } from 'next/server'
import { appUrl, beginOAuthFlow } from '@/lib/oauth'
import { resolveConnectSession } from '@/lib/connect-session'
import { findManifest } from '@/lib/providers/core/manifests'
import { isProviderError } from '@/lib/providers/core/errors'

/**
 * The popup's first stop: start an OAuth flow on behalf of a connect session.
 *
 * A route rather than a server action because the popup navigates here, and a
 * navigation is a GET. The session is resolved again from the token, so a popup
 * opened with a link someone else guessed gets nowhere: the token is the only
 * thing that says which client this account is being attached to, and it is
 * checked here exactly as it is on the page.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string; provider: string }> }
) {
  const { token, provider } = await ctx.params
  const done = (status: string, session?: string) =>
    NextResponse.redirect(
      `${appUrl()}/connect/done?status=${status}${session ? `&session=${encodeURIComponent(session)}` : ''}`
    )

  const resolved = await resolveConnectSession(token)
  if (resolved.state !== 'ok') {
    return done(resolved.state === 'used' ? 'used' : 'failed', 'session' in resolved ? resolved.session.id : undefined)
  }

  const { session } = resolved
  const manifest = findManifest(provider)

  // A session pinned to one service may not be talked into another one.
  if (!manifest || (session.provider && manifest.slug !== session.provider)) {
    return done('failed', session.id)
  }

  if (manifest.auth.type !== 'OAUTH2') {
    return done('failed', session.id)
  }

  try {
    const { authorizationUrl } = await beginOAuthFlow({
      providerSlug: manifest.slug,
      clientId: session.clientId,
      connectSessionId: session.id,
    })

    return NextResponse.redirect(authorizationUrl)
  } catch (error) {
    // The message would name our server configuration, which is nothing an end
    // customer can act on; it goes to the log and they get a plain failure.
    console.error(
      `[Connect] could not start ${manifest.slug} for session ${session.id}:`,
      isProviderError(error) ? error.publicMessage : error
    )
    return done('failed', session.id)
  }
}
