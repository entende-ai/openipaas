"use server"

import { beginOAuthFlow } from '@/lib/oauth'
import { requireDashboardSession } from '@/lib/auth-session'
import { isProviderError } from '@/lib/providers/core/errors'

/**
 * Starts an OAuth connection for any registry provider.
 *
 * Replaces the previous Conta Azul-specific URL builder: the manifest supplies
 * the authorization endpoint and scopes, and the state is now a single-use
 * server-side value instead of the raw client id.
 */
export async function getProviderAuthUrl(providerSlug: string, clientId: string) {
  await requireDashboardSession()

  try {
    const { authorizationUrl } = await beginOAuthFlow({ providerSlug, clientId })
    return { success: true as const, url: authorizationUrl }
  } catch (error) {
    console.error('[OAuth] could not start the flow:', error)
    return {
      success: false as const,
      error: isProviderError(error) ? error.publicMessage : 'Could not start the connection.',
    }
  }
}
