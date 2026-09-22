import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { generateApiKeyValue } from '@/lib/crypto'
import { adminError, withAdminAuth } from '@/lib/admin-auth'
import { describeScopes } from '@/lib/scopes'

/**
 * Revoking a key, and rotating one.
 *
 * Rotation is issue plus revoke in one call, keeping the name and the scopes,
 * because doing it in two calls leaves a window where either both work or
 * neither does, depending on the order, and whichever order a caller picks it
 * will sometimes be the wrong one.
 */

export const DELETE = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const key = await prisma.apiKey.findUnique({ where: { id } })
  if (!key) return adminError(404, 'NOT_FOUND', 'No key with that id.', auth.requestId)

  // Revoking twice is not an error: the caller wanted it dead, and it is.
  const revoked = key.revokedAt
    ? key
    : await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })

  return NextResponse.json({ id: revoked.id, revokedAt: revoked.revokedAt?.toISOString() ?? null })
})

export const POST = withAdminAuth<{ id: string }>(async (_req, auth, routeCtx) => {
  const { id } = await routeCtx.params

  const key = await prisma.apiKey.findUnique({ where: { id } })
  if (!key) return adminError(404, 'NOT_FOUND', 'No key with that id.', auth.requestId)
  if (key.revokedAt) {
    return adminError(409, 'INVALID_REQUEST', 'That key is already revoked. Issue a new one instead.', auth.requestId)
  }

  const { plaintext, hash, prefix } = generateApiKeyValue()

  const [replacement] = await prisma.$transaction([
    prisma.apiKey.create({
      data: { keyHash: hash, keyPrefix: prefix, name: key.name, scopes: key.scopes, clientId: key.clientId },
    }),
    prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } }),
  ])

  return NextResponse.json(
    {
      id: replacement.id,
      prefix: replacement.keyPrefix,
      name: replacement.name,
      scopes: replacement.scopes,
      can: describeScopes(replacement.scopes),
      key: plaintext,
      replaced: key.id,
      warning: 'The old key stopped working the moment this answer was written. Store the new one now.',
    },
    { status: 201 }
  )
})
