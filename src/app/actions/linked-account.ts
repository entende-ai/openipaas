"use server"

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { toStoredCredential } from '@/lib/credentials'
import { getManifest, isKnownProvider } from '@/lib/providers/core/registry'
import { requireDashboardSession } from '@/lib/auth-session'

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

export async function deleteLinkedAccount(id: string) {
  await requireDashboardSession()
  await prisma.linkedAccount.delete({ where: { id } })
  revalidatePath('/dashboard/linked-accounts')
  return { success: true }
}
