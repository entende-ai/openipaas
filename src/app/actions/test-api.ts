"use server"

import prisma from '@/lib/prisma'
import { pickActiveCredential, toProviderContext } from '@/lib/credentials'
import { createProvider, getManifest, isKnownProvider } from '@/lib/providers/core/registry'
import { refreshCredential } from '@/lib/token-refresh'
import { isProviderError } from '@/lib/providers/core/errors'
import { requireDashboardSession } from '@/lib/auth-session'

/**
 * Live connectivity check for a connected account.
 *
 * Calls the provider directly rather than looping back through our own HTTP API:
 * API keys are stored hashed and cannot be read back, and this isolates the
 * provider/credential path from the auth layer when diagnosing a failure.
 */
export async function testUnifiedApi(linkedAccountId: string) {
  await requireDashboardSession()

  try {
    const linkedAccount = await prisma.linkedAccount.findUnique({
      where: { id: linkedAccountId },
      include: { credentials: true },
    })

    if (!linkedAccount) throw new Error('Linked account not found.')
    if (!isKnownProvider(linkedAccount.provider)) {
      throw new Error(`Provider ${linkedAccount.provider} is not in the registry.`)
    }

    const credential = pickActiveCredential(linkedAccount.credentials)
    if (!credential) throw new Error('This account has no stored credential. Reconnect it.')

    const manifest = getManifest(linkedAccount.provider)
    if (!manifest.capabilities.customers?.includes('list')) {
      return {
        success: false,
        status: 501,
        error: `${manifest.name} does not support listing customers yet.`,
      }
    }

    const provider = createProvider(linkedAccount.provider, { refreshCredential })
    const ctx = toProviderContext(credential, linkedAccount.provider)

    const startedAt = Date.now()
    const page = await (provider as any).listCustomers(ctx, { limit: 3 })

    return {
      success: true,
      status: 200,
      latencyMs: Date.now() - startedAt,
      data: {
        provider: manifest.name,
        totalItems: page.totalItems,
        hasMore: page.hasMore,
        sample: page.items.slice(0, 3),
      },
    }
  } catch (error: any) {
    console.error('[TestApi] failed:', error)
    return {
      success: false,
      status: isProviderError(error) ? error.status : 500,
      error: isProviderError(error) ? error.publicMessage : error?.message || 'Unexpected error',
    }
  }
}
