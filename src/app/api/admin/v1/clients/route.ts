import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adminError, readName, withAdminAuth } from '@/lib/admin-auth'

/**
 * The clients of this deployment.
 *
 * Creating one is the step that used to require a person: a company signs up in
 * your product, and its client here is what every later call is scoped to.
 */
export const GET = withAdminAuth(async () => {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { linkedAccounts: true } },
      apiKeys: { where: { revokedAt: null }, select: { id: true } },
    },
  })

  return NextResponse.json({
    items: clients.map((client) => ({
      id: client.id,
      name: client.name,
      createdAt: client.createdAt.toISOString(),
      connections: client._count.linkedAccounts,
      activeKeys: client.apiKeys.length,
    })),
    totalItems: clients.length,
  })
})

export const POST = withAdminAuth(async (_req, auth) => {
  const parsed = readName(auth.body?.name)
  if ('error' in parsed) return adminError(400, 'INVALID_REQUEST', parsed.error, auth.requestId)

  // Names are for people to read, so two clients may share one. The id is what
  // anything else refers to.
  const client = await prisma.client.create({ data: { name: parsed.value } })

  return NextResponse.json(
    { id: client.id, name: client.name, createdAt: client.createdAt.toISOString() },
    { status: 201 }
  )
})
