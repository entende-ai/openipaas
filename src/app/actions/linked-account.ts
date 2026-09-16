"use server"

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { toStoredCredential } from '@/lib/credentials'
import { getManifest, isKnownProvider } from '@/lib/providers/core/registry'
import { requireDashboardSession, requireOwner } from '@/lib/auth-session'

/**
 * Connects an account whose provider authenticates with static credentials
 * (Omie-style app key/secret) rather than an OAuth redirect.
 *
 * Provider-declared fields land in the encrypted secrets bag, so a new API-key
 * provider needs no schema change.
 */
export async function connectErpAccount(formData: FormData) {
  await requireDashboardSession()

  const clientId = formData.get('clientId') as string
  const provider = (formData.get('provider') as string || '').toUpperCase()

  if (!clientId || !provider) return { error: 'Missing required fields' }
  if (!isKnownProvider(provider)) return { error: `Unknown provider ${provider}` }

  const manifest = getManifest(provider)

  const secrets: Record<string, string> = {}
  if (manifest.auth.type !== 'OAUTH2') {
    for (const field of manifest.auth.fields) {
      const value = (formData.get(field.key) as string | null)?.trim()
      if (field.required && !value) return { error: `${field.label} is required` }
      if (value) secrets[field.key] = value
    }
  }

  // Primary token: the first declared field, or an explicit accessToken.
  const accessToken =
    (formData.get('accessToken') as string | null)?.trim() ||
    (manifest.auth.type !== 'OAUTH2' ? secrets[manifest.auth.fields[0]?.key] : '') ||
    ''

  if (!accessToken) return { error: 'Missing credentials' }

  const linkedAccount = await prisma.linkedAccount.create({
    data: {
      clientId,
      provider,
      label: manifest.name,
      credentials: {
        create: {
          authType: manifest.auth.type,
          instanceUrl: (formData.get('instanceUrl') as string | null)?.trim() || null,
          externalTenantId: (formData.get('externalTenantId') as string | null)?.trim() || null,
          ...toStoredCredential({
            accessToken,
            refreshToken: (formData.get('refreshToken') as string | null)?.trim() || null,
            erpClientId: (formData.get('erpClientId') as string | null)?.trim() || null,
            erpClientSecret: (formData.get('erpClientSecret') as string | null)?.trim() || null,
            secrets,
          }),
        },
      },
    },
  })

  revalidatePath('/dashboard/linked-accounts')
  return { success: true, linkedAccount: { id: linkedAccount.id, accountToken: linkedAccount.accountToken } }
}

/**
 * Disconnecting cannot be undone from here: reconnecting means the end customer
 * authorizing the app again, which is a phone call, not a click.
 */
export async function deleteLinkedAccount(id: string) {
  await requireOwner()

  // Read it first, so a request naming an id that is not there answers the same
  // way whether it never existed or was already deleted.
  const account = await prisma.linkedAccount.findUnique({ where: { id }, select: { id: true } })
  if (!account) return { error: 'That connection no longer exists.' }

  await prisma.linkedAccount.delete({ where: { id } })
  revalidatePath('/dashboard/linked-accounts')
  return { success: true }
}

/**
 * Hands the account token to the screen, on request.
 *
 * It is a live credential, so it is fetched when someone asks rather than
 * rendered into a page anyone with a session can open.
 */
export async function revealAccountToken(id: string) {
  await requireOwner()

  const account = await prisma.linkedAccount.findUnique({
    where: { id },
    select: { accountToken: true },
  })
  if (!account) return { error: 'That connection no longer exists.' }

  return { token: account.accountToken }
}
