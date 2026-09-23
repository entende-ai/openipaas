import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  appUrl,
  connectSessionIdForState,
  consumeOAuthState,
  exchangeCodeForTokens,
  slugFromCallbackSegment,
} from '@/lib/oauth'
import { persistNewCredential } from '@/lib/token-refresh'
import { emitConnectionEvent } from '@/lib/webhooks'
import { completeConnectSession } from '@/lib/connect-session'
import { getManifest, isKnownProvider } from '@/lib/providers/core/registry'
import { isProviderError } from '@/lib/providers/core/errors'

/**
 * One callback for every OAuth provider.
 *
 * Adding an OAuth integration needs no new route: the manifest supplies the
 * token endpoint and the registry resolves the provider from the URL segment.
 */
export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: segment } = await ctx.params
  const slug = slugFromCallbackSegment(segment)
  const url = new URL(request.url)

  const state = url.searchParams.get('state')

  // Whoever started this decides where a failure lands. An end customer who
  // pressed cancel must go back to the page that sent them, never to a console
  // sign-in screen they have no account for.
  const connectSessionId = state ? await connectSessionIdForState(state) : null

  const failure = (message: string, outcome: 'failed' | 'cancelled' = 'failed') =>
    connectSessionId
      ? NextResponse.redirect(
          `${appUrl()}/connect/done?session=${encodeURIComponent(connectSessionId)}&status=${outcome}`
        )
      : NextResponse.redirect(`${appUrl()}/dashboard/linked-accounts?error=${encodeURIComponent(message)}`)

  if (!isKnownProvider(slug)) {
    return failure('Unknown provider')
  }

  // The provider reports a user-side denial through these parameters.
  const oauthError = url.searchParams.get('error')
  if (oauthError) {
    console.warn(`[OAuth] ${slug} returned error=${oauthError}`)
    return failure('The connection was cancelled', 'cancelled')
  }

  const code = url.searchParams.get('code')
  if (!code || !state) {
    return failure('Missing authorization parameters')
  }

  try {
    // Validates and burns the state before anything else happens.
    const verified = await consumeOAuthState(state, slug)

    const tokens = await exchangeCodeForTokens({
      providerSlug: slug,
      code,
      redirectUri: verified.redirectUri,
      codeVerifier: verified.codeVerifier,
    })

    const manifest = getManifest(slug)

    const linkedAccount =
      (await prisma.linkedAccount.findFirst({ where: { clientId: verified.clientId, provider: slug } })) ??
      (await prisma.linkedAccount.create({
        data: { clientId: verified.clientId, provider: slug, label: manifest.name },
      }))

    await persistNewCredential({
      linkedAccountId: linkedAccount.id,
      authType: manifest.auth.type,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    })

    // Also the event a subscriber gets when a broken connection is fixed: the
    // account it was told had expired is working again.
    await emitConnectionEvent({ eventType: 'connection.connected', linkedAccountId: linkedAccount.id })

    // A flow that started from a hosted connect link ends on the hosted page,
    // which knows how to tell the product that sent the customer. Sending it to
    // the console instead would drop an end customer into our dashboard.
    if (verified.connectSessionId) {
      const finished = await completeConnectSession(verified.connectSessionId, linkedAccount.id)

      return NextResponse.redirect(
        `${appUrl()}/connect/done?session=${encodeURIComponent(verified.connectSessionId)}&status=${
          finished ? 'connected' : 'used'
        }`
      )
    }

    return NextResponse.redirect(`${appUrl()}/dashboard/linked-accounts?connected=${encodeURIComponent(manifest.name)}`)
  } catch (error) {
    console.error(`[OAuth] ${slug} callback failed:`, error)
    return failure(isProviderError(error) ? error.publicMessage : 'Could not complete the connection')
  }
}
