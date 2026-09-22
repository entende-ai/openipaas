import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adminError, withAdminAuth } from '@/lib/admin-auth'
import { createEndpoint, EVENT_TYPES, isEventType, type UnifiedEventType } from '@/lib/webhooks'

/**
 * Where this client should be told about its connections.
 *
 * Here rather than only in the dashboard because the product that creates the
 * client is the product that knows its own callback URL, and a setup step a
 * person has to remember is a setup step that gets forgotten.
 */
export const GET = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  })

  return NextResponse.json({
    items: endpoints.map((endpoint) => ({ ...endpoint, createdAt: endpoint.createdAt.toISOString() })),
    totalItems: endpoints.length,
  })
})

export const POST = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
  if (!client) return adminError(404, 'NOT_FOUND', 'No client with that id.', auth.requestId)

  const url = typeof auth.body?.url === 'string' ? auth.body.url.trim() : ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return adminError(400, 'INVALID_REQUEST', 'url must be an absolute URL.', auth.requestId)
  }
  // The signature proves a delivery is ours; plain http would put both it and
  // the payload on the wire in the clear.
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    return adminError(400, 'INVALID_REQUEST', 'url must be https, except on localhost.', auth.requestId)
  }

  const asked: string[] = Array.isArray(auth.body?.events) ? auth.body.events.map(String) : EVENT_TYPES
  const events = asked.filter(isEventType) as UnifiedEventType[]
  if (events.length === 0) {
    return adminError(
      400,
      'INVALID_REQUEST',
      `events must name at least one of: ${EVENT_TYPES.join(', ')}.`,
      auth.requestId
    )
  }

  const { endpoint, secret } = await createEndpoint({ clientId: id, url: parsed.toString(), events })

  return NextResponse.json(
    {
      id: endpoint.id,
      url: endpoint.url,
      events: endpoint.events,
      active: endpoint.active,
      secret,
      warning: 'Store this signing secret now. It is encrypted here and cannot be shown again.',
    },
    { status: 201 }
  )
})
