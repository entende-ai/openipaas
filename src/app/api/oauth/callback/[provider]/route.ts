import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { appUrl, consumeOAuthState, exchangeCodeForTokens, slugFromCallbackSegment } from '@/lib/oauth'
import { persistNewCredential } from '@/lib/token-refresh'
import { emitConnectionEvent } from '@/lib/webhooks'
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

  const failure = (message: string) =>
    NextResponse.redirect(`${appUrl()}/dashboard/linked-accounts?error=${encodeURIComponent(message)}`)

  if (!isKnownProvider(slug)) {
    return failure('Unknown provider')
  }

  // The provider reports a user-side denial through these parameters.
  const oauthError = url.searchParams.get('error')
  if (oauthError) {
    console.warn(`[OAuth] ${slug} returned error=${oauthError}`)
    return failure('The connection was cancelled')
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
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

    return NextResponse.redirect(`${appUrl()}/dashboard/linked-accounts?connected=${encodeURIComponent(manifest.name)}`)
  } catch (error) {
    console.error(`[OAuth] ${slug} callback failed:`, error)
    return failure(isProviderError(error) ? error.publicMessage : 'Could not complete the connection')
  }
}
