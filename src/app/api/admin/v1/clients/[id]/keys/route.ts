import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { generateApiKeyValue } from '@/lib/crypto'
import { adminError, withAdminAuth } from '@/lib/admin-auth'
import { describeScopes, FULL_ACCESS, parseScopes } from '@/lib/scopes'

/**
 * The keys of one client: what it can call with, and what each one may do.
 *
 * The plaintext exists once, in the response to the POST that made it. Storing
 * a hash is what makes a leaked database not a leaked set of credentials, so
 * there is no endpoint that shows a key again.
 */

function view(key: {
  id: string
  keyPrefix: string | null
  name: string | null
  scopes: string[]
  rateLimit: number | null
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}) {
  return {
    id: key.id,
    prefix: key.keyPrefix,
    name: key.name,
    scopes: key.scopes,
    can: describeScopes(key.scopes),
    rateLimit: key.rateLimit,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  }
}

export const GET = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
  if (!client) return adminError(404, 'NOT_FOUND', 'No client with that id.', auth.requestId)

  const keys = await prisma.apiKey.findMany({ where: { clientId: id }, orderBy: { createdAt: 'desc' } })

  return NextResponse.json({ items: keys.map(view), totalItems: keys.length })
})

export const POST = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
  if (!client) return adminError(404, 'NOT_FOUND', 'No client with that id.', auth.requestId)

  const requested = parseScopes(auth.body?.scopes)
  // Asking for scopes and getting silently upgraded to all of them would be the
  // worst kind of surprise, so an unreadable list is a refusal, not a default.
  if (auth.body?.scopes !== undefined && requested.length === 0) {
    return adminError(
      400,
      'INVALID_REQUEST',
      'None of those scopes are valid. Use read or write with a resource or *, as in read:contacts.',
      auth.requestId
    )
  }

  // A key with its own budget, for a caller whose shape differs from the rest:
  // a nightly sync that walks every page, or an agent that must stay responsive
  // while one does.
  const rateLimit = auth.body?.rateLimit
  if (rateLimit !== undefined && (typeof rateLimit !== 'number' || !Number.isInteger(rateLimit) || rateLimit < 1)) {
    return adminError(400, 'INVALID_REQUEST', 'rateLimit must be a whole number of requests per minute.', auth.requestId)
  }

  const { plaintext, hash, prefix } = generateApiKeyValue()
  const created = await prisma.apiKey.create({
    data: {
      keyHash: hash,
      keyPrefix: prefix,
      name: typeof auth.body?.name === 'string' ? auth.body.name.trim() || null : null,
      scopes: requested.length > 0 ? requested : FULL_ACCESS,
      rateLimit: rateLimit ?? null,
      clientId: id,
    },
  })

  return NextResponse.json(
    { ...view(created), key: plaintext, warning: 'Store this key now. It is hashed here and cannot be shown again.' },
    { status: 201 }
  )
})
