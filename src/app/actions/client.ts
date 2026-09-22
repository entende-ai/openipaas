"use server"

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { generateApiKeyValue } from '@/lib/crypto'
import { requireDashboardSession, requireOwner } from '@/lib/auth-session'
import { FULL_ACCESS, parseScopes } from '@/lib/scopes'

/**
 * A client's name is a label for the people running the console.
 *
 * Nothing downstream keys on it: API keys, connections and logs all reference
 * the id, so renaming is safe and needs no more than a session.
 */
const MAX_NAME_LENGTH = 120

function readName(formData: FormData): { name: string } | { error: string } {
  const name = ((formData.get('name') as string | null) ?? '').trim()

  if (!name) return { error: 'Name is required.' }
  if (name.length > MAX_NAME_LENGTH) return { error: `Keep the name under ${MAX_NAME_LENGTH} characters.` }

  return { name }
}

export async function createClient(formData: FormData) {
  await requireDashboardSession()

  const parsed = readName(formData)
  if ('error' in parsed) return parsed

  await prisma.client.create({ data: { name: parsed.name } })

  revalidatePath('/dashboard/clients')
  return { success: true }
}

export async function renameClient(clientId: string, formData: FormData) {
  await requireDashboardSession()

  const parsed = readName(formData)
  if ('error' in parsed) return parsed

  // Read first, so an id that is not there answers the same whether it never
  // existed or was deleted a moment ago.
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } })
  if (!client) return { error: 'That client no longer exists.' }

  if (client.name === parsed.name) return { success: true }

  await prisma.client.update({ where: { id: clientId }, data: { name: parsed.name } })

  // The name is printed on the connections page too.
  revalidatePath('/dashboard/clients')
  revalidatePath('/dashboard/linked-accounts')
  return { success: true }
}

/**
 * Issues an API key.
 *
 * The plaintext is returned once and never stored: only its SHA-256 digest and a
 * display prefix are persisted, so a database dump yields no usable keys.
 */
/**
 * Issues a key, named and scoped.
 *
 * The scope is chosen here rather than edited later on purpose: changing what a
 * key may do, in place, changes what something already running is allowed to do
 * without that thing being told. Issuing a second key and revoking the first is
 * the same change, made visible.
 */
export async function generateApiKey(clientId: string, name?: string, scopes?: string[]) {
  await requireDashboardSession()

  const { plaintext, hash, prefix } = generateApiKeyValue()
  // An unreadable or empty scope list would mean full access, so anything the
  // form did not spell out correctly falls back to saying so explicitly.
  const requested = parseScopes(scopes)

  await prisma.apiKey.create({
    data: {
      keyHash: hash,
      keyPrefix: prefix,
      name: name?.trim() || null,
      scopes: requested.length > 0 ? requested : FULL_ACCESS,
      clientId,
    },
  })

  revalidatePath('/dashboard/clients')
  return { success: true, apiKey: plaintext, warning: 'Copy this key now. It cannot be shown again.' }
}

/** Revoking breaks whatever is calling with that key, and cannot be undone. */
export async function revokeApiKey(apiKeyId: string) {
  await requireOwner()

  const key = await prisma.apiKey.findUnique({ where: { id: apiKeyId }, select: { id: true } })
  if (!key) return { error: 'That key no longer exists.' }

  await prisma.apiKey.update({ where: { id: apiKeyId }, data: { revokedAt: new Date() } })

  revalidatePath('/dashboard/clients')
  return { success: true }
}
