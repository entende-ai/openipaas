"use server"

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { generateAdminKeyValue } from '@/lib/crypto'
import { requireOwner } from '@/lib/auth-session'

/**
 * Admin keys are the one credential that is not scoped to a client.
 *
 * Owners only, both ways: issuing one hands out the ability to create clients
 * and issue their keys, and revoking one can stop somebody else's integration
 * mid-flight.
 */

export async function issueAdminKey(name?: string) {
  await requireOwner()

  const { plaintext, hash, prefix } = generateAdminKeyValue()

  await prisma.adminKey.create({
    data: { keyHash: hash, keyPrefix: prefix, name: name?.trim() || null },
  })

  revalidatePath('/dashboard/clients')
  return { success: true as const, key: plaintext, warning: 'Copy it now. It is stored hashed and cannot be shown again.' }
}

export async function revokeAdminKey(id: string) {
  await requireOwner()

  const key = await prisma.adminKey.findUnique({ where: { id }, select: { id: true } })
  if (!key) return { error: 'That key no longer exists.' }

  await prisma.adminKey.update({ where: { id }, data: { revokedAt: new Date() } })
  revalidatePath('/dashboard/clients')
  return { success: true as const }
}
