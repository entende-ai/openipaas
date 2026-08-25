"use server"

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { generateApiKeyValue } from '@/lib/crypto'
import { requireDashboardSession } from '@/lib/auth-session'

export async function createClient(formData: FormData) {
  await requireDashboardSession()

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Name is required' }

  await prisma.client.create({ data: { name } })

  revalidatePath('/dashboard/clients')
  return { success: true }
}

/**
 * Issues an API key.
 *
 * The plaintext is returned once and never stored: only its SHA-256 digest and a
 * display prefix are persisted, so a database dump yields no usable keys.
 */
export async function generateApiKey(clientId: string, name?: string) {
  await requireDashboardSession()

  const { plaintext, hash, prefix } = generateApiKeyValue()

  await prisma.apiKey.create({
    data: {
      keyHash: hash,
      keyPrefix: prefix,
      name: name?.trim() || null,
      clientId,
    },
  })

  revalidatePath('/dashboard/clients')
  return { success: true, apiKey: plaintext, warning: 'Copy this key now. It cannot be shown again.' }
}

export async function revokeApiKey(apiKeyId: string) {
  await requireDashboardSession()

  await prisma.apiKey.update({ where: { id: apiKeyId }, data: { revokedAt: new Date() } })

  revalidatePath('/dashboard/clients')
  return { success: true }
}
