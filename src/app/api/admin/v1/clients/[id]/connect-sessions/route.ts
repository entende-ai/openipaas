import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adminError, withAdminAuth } from '@/lib/admin-auth'
import { createConnectSession, readOrigin, readUrl, SESSION_TTL_MS } from '@/lib/connect-session'
import { connectSecretConfigured } from '@/lib/connect-token'
import { findManifest } from '@/lib/providers/core/manifests'

/**
 * A link a product hands to its own customer, so they can connect an account
 * without ever seeing this console.
 *
 * Everything optional here exists to make the page look like it belongs to the
 * product that sent the customer: the service to pin, where to send them back,
 * which origins may frame it, and what to call the company on screen.
 */
export const POST = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  if (!connectSecretConfigured()) {
    return adminError(
      503,
      'CONFIG_ERROR',
      'DASHBOARD_SESSION_SECRET is not set, so connect links cannot be signed.',
      auth.requestId
    )
  }

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
  if (!client) return adminError(404, 'NOT_FOUND', 'No client with that id.', auth.requestId)

  const body = auth.body ?? {}

  // A service that does not exist would give the customer an empty page with
  // nothing to click, which reads as our bug rather than as a typo.
  if (body.provider !== undefined && body.provider !== null) {
    const manifest = findManifest(String(body.provider))
    if (!manifest) {
      return adminError(
        400,
        'INVALID_REQUEST',
        `Unknown provider "${String(body.provider)}". The service names are listed by GET /api/unified/v1/providers.`,
        auth.requestId
      )
    }
    body.provider = manifest.slug
  }

  if (body.redirectUrl !== undefined && body.redirectUrl !== null) {
    const parsed = readUrl(body.redirectUrl, 'redirectUrl')
    if ('error' in parsed) return adminError(400, 'INVALID_REQUEST', parsed.error, auth.requestId)
    body.redirectUrl = parsed.value
  }

  const origins: string[] = []
  if (body.origins !== undefined) {
    if (!Array.isArray(body.origins)) {
      return adminError(400, 'INVALID_REQUEST', 'origins must be an array of absolute URLs.', auth.requestId)
    }
    for (const entry of body.origins) {
      const parsed = readOrigin(entry)
      if ('error' in parsed) return adminError(400, 'INVALID_REQUEST', parsed.error, auth.requestId)
      origins.push(parsed.value)
    }
  }

  const session = await createConnectSession({
    clientId: id,
    provider: body.provider ?? null,
    redirectUrl: body.redirectUrl ?? null,
    origins,
    label: typeof body.label === 'string' ? body.label.trim() || null : null,
    logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl.trim() || null : null,
    accentColor: typeof body.accentColor === 'string' ? body.accentColor.trim() || null : null,
  })

  return NextResponse.json(
    {
      id: session.id,
      token: session.token,
      url: session.url,
      expiresAt: session.expiresAt.toISOString(),
      expiresInSeconds: Math.round(SESSION_TTL_MS / 1000),
      // Framing only works for the origins the session named, so saying so here
      // is cheaper than debugging a blank iframe later.
      frameableBy: origins,
    },
    { status: 201 }
  )
})

/** What has been handed out for this client, without the tokens. */
export const GET = withAdminAuth<{ id: string }>(async (_req, _auth, routeCtx) => {
  const { id } = await routeCtx.params

  const sessions = await prisma.connectSession.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      provider: true,
      origins: true,
      expiresAt: true,
      usedAt: true,
      linkedAccountId: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    items: sessions.map((session) => ({
      ...session,
      expiresAt: session.expiresAt.toISOString(),
      usedAt: session.usedAt?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
    })),
    totalItems: sessions.length,
  })
})
