import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adminError, withAdminAuth } from '@/lib/admin-auth'
import { describeConnections } from '@/lib/connections-view'

/**
 * How a connect session went, for a product that would rather ask than
 * subscribe.
 *
 * The webhook is the better answer, because it arrives without anyone waiting,
 * but polling has to exist: a product in the middle of a signup wizard wants to
 * know before the page moves on.
 */
export const GET = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const session = await prisma.connectSession.findUnique({ where: { id } })
  if (!session) return adminError(404, 'NOT_FOUND', 'No connect session with that id.', auth.requestId)

  const connection = session.linkedAccountId
    ? await prisma.linkedAccount.findUnique({
        where: { id: session.linkedAccountId },
        include: { credentials: true },
      })
    : null

  const status = session.usedAt ? 'connected' : session.expiresAt.getTime() <= Date.now() ? 'expired' : 'pending'

  return NextResponse.json({
    id: session.id,
    clientId: session.clientId,
    status,
    provider: session.provider,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    usedAt: session.usedAt?.toISOString() ?? null,
    // The same shape GET /connections answers with, so a product that already
    // reads that needs no second parser.
    connection: connection ? describeConnections({ accounts: [connection] })[0] : null,
  })
})
