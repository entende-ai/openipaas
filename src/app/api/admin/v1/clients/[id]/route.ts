import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adminError, readName, withAdminAuth } from '@/lib/admin-auth'
import { describeConnections } from '@/lib/connections-view'

/**
 * One client, with what it has.
 *
 * Deleting a client is deliberately not here. It would take its keys,
 * connections and request history with it, and a program that can do that by
 * accident is a program that eventually will. Revoke the keys instead, and let
 * a person do the rest in the dashboard.
 */
export const GET = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const client = await prisma.client.findUnique({
    where: { id },
    include: { linkedAccounts: { include: { credentials: true }, orderBy: { createdAt: 'asc' } } },
  })

  if (!client) return adminError(404, 'NOT_FOUND', 'No client with that id.', auth.requestId)

  return NextResponse.json({
    id: client.id,
    name: client.name,
    createdAt: client.createdAt.toISOString(),
    connections: describeConnections({ accounts: client.linkedAccounts }),
  })
})

export const PATCH = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const parsed = readName(auth.body?.name)
  if ('error' in parsed) return adminError(400, 'INVALID_REQUEST', parsed.error, auth.requestId)

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
  if (!client) return adminError(404, 'NOT_FOUND', 'No client with that id.', auth.requestId)

  const updated = await prisma.client.update({ where: { id }, data: { name: parsed.value } })

  return NextResponse.json({ id: updated.id, name: updated.name, createdAt: updated.createdAt.toISOString() })
})
