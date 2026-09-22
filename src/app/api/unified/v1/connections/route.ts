import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withClientAuth } from '@/lib/api-auth'
import { describeConnections } from '@/lib/connections-view'
import { allows } from '@/lib/scopes'

/**
 * What this client has connected.
 *
 * The counterpart of `GET /providers`: that one is the catalog of what the
 * platform supports, this one is what one company actually has, with the
 * service name to send as `X-Provider`, the token that pins an exact account,
 * and enough status for a screen to say why something is not answering.
 *
 * Authenticated by the API key alone, and scoped to its client, so there is
 * nothing here to pick: a key sees its own connections and no others.
 */
export const GET = withClientAuth(async (_req, auth) => {
  if (!allows(auth.scopes, 'read', 'connections')) {
    return NextResponse.json(
      { error: 'This key is not allowed to read connections.', code: 'FORBIDDEN', requestId: auth.requestId },
      { status: 403 }
    )
  }

  // One query for every connection: the last request that reached it, which is
  // what "when did this last work" means without asking the provider.
  const lastUsed = await prisma.requestLog.groupBy({
    by: ['linkedAccountId'],
    where: { clientId: auth.client.id, linkedAccountId: { not: null } },
    _max: { createdAt: true },
  })

  const lastUsedAt = new Map<string, Date>()
  for (const row of lastUsed) {
    if (row.linkedAccountId && row._max.createdAt) lastUsedAt.set(row.linkedAccountId, row._max.createdAt)
  }

  const items = describeConnections({ accounts: auth.accounts, lastUsedAt })

  return NextResponse.json({ items, totalItems: items.length })
})
