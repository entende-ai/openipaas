"use server"

import prisma from '@/lib/prisma'
import { pickActiveCredential, toProviderContext } from '@/lib/credentials'
import { createProvider, getManifest, isKnownProvider } from '@/lib/providers/core/registry'
import { refreshCredential } from '@/lib/token-refresh'
import { isProviderError } from '@/lib/providers/core/errors'
import { requireDashboardSession } from '@/lib/auth-session'
import { PLAYGROUND_METHOD, normalizePassthroughPath, playgroundOperations } from '@/lib/dashboard/playground'
import type { ListParams, Page, ProviderContext, ResourceName } from '@/lib/providers/core/types'

/**
 * The playground behind the connected accounts screen.
 *
 * Calls the provider directly rather than looping back through our own HTTP
 * API: keys are stored hashed and cannot be read back, and this isolates the
 * provider and credential path from the auth layer when diagnosing a failure.
 *
 * Reads only. A stray write from a test console lands in a real customer's
 * system, so the method is fixed rather than offered.
 */

export interface PlaygroundResult {
  /** Whether the upstream answered with a non-error status. */
  success: boolean
  status: number
  /** The call as it was made, so the developer can reproduce it. */
  request: string
  latencyMs?: number
  /** Present when the call reached the provider, even on a 4xx from them. */
  data?: unknown
  /** Present when the call never got that far. */
  error?: string
}

export interface PlaygroundRequest {
  linkedAccountId: string
  /** A `list:<resource>` id from playgroundOperations, or 'passthrough'. */
  operationId: string
  /** Only for passthrough: the raw upstream path, relative to the provider. */
  path?: string
}

const LIST_METHODS: Record<string, string> = {
  customers: 'listCustomers',
  products: 'listProducts',
  categories: 'listCategories',
  brands: 'listBrands',
  units: 'listUnits',
  sales: 'listSales',
  sellers: 'listSellers',
}

type ListMethod = (ctx: ProviderContext, params: ListParams) => Promise<Page<unknown>>
type PassthroughMethod = (
  ctx: ProviderContext,
  req: { method: string; path: string }
) => Promise<{ status: number; body: unknown }>

export async function runPlaygroundRequest(input: PlaygroundRequest): Promise<PlaygroundResult> {
  await requireDashboardSession()

  const described = input.operationId === 'passthrough' ? `${PLAYGROUND_METHOD} ${input.path ?? ''}`.trim() : input.operationId

  try {
    const linkedAccount = await prisma.linkedAccount.findUnique({
      where: { id: input.linkedAccountId },
      include: { credentials: true },
    })

    if (!linkedAccount) throw new Error('Linked account not found.')
    if (!isKnownProvider(linkedAccount.provider)) {
      throw new Error(`Provider ${linkedAccount.provider} is not in the registry.`)
    }

    const credential = pickActiveCredential(linkedAccount.credentials)
    if (!credential) {
      return {
        success: false,
        status: 400,
        request: described,
        error: 'This account has no stored credential. Connect it again.',
      }
    }

    const manifest = getManifest(linkedAccount.provider)
    // Methods are resolved by name from the manifest, so this steps outside the
    // UnifiedProvider interface on purpose.
    const provider = createProvider(linkedAccount.provider, { refreshCredential }) as unknown as Record<string, unknown>
    const ctx = toProviderContext(credential, linkedAccount.provider)

    if (input.operationId === 'passthrough') {
      if (!manifest.passthrough) {
        return {
          success: false,
          status: 501,
          request: described,
          error: `${manifest.name} does not expose passthrough.`,
        }
      }

      const resolved = normalizePassthroughPath(input.path ?? '')
      if ('error' in resolved) {
        return { success: false, status: 400, request: described, error: resolved.error }
      }

      const startedAt = Date.now()
      const response = await (provider.passthrough as PassthroughMethod)(ctx, {
        method: PLAYGROUND_METHOD,
        path: resolved.path,
      })

      return {
        success: response.status < 400,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        request: `${PLAYGROUND_METHOD} ${manifest.baseUrl}${resolved.path}`,
        data: response.body,
      }
    }

    const resource = input.operationId.startsWith('list:')
      ? (input.operationId.slice('list:'.length) as ResourceName)
      : null

    const operation = resource ? playgroundOperations(manifest).find((candidate) => candidate.resource === resource) : null

    if (!resource || !operation) {
      return {
        success: false,
        status: 501,
        request: described,
        error: `${manifest.name} does not support that operation. Pick one from the list.`,
      }
    }

    const startedAt = Date.now()
    const page = await (provider[LIST_METHODS[resource]] as ListMethod)(ctx, { limit: 3 })

    return {
      success: true,
      status: 200,
      latencyMs: Date.now() - startedAt,
      request: `${operation.method} /api/unified/v1${operation.path}`,
      data: {
        provider: manifest.name,
        totalItems: page.totalItems,
        hasMore: page.hasMore,
        sample: page.items.slice(0, 3),
      },
    }
  } catch (error) {
    console.error('[Playground] failed:', error)

    return {
      success: false,
      status: isProviderError(error) ? error.status : 500,
      request: described,
      error: isProviderError(error) ? error.publicMessage : (error as Error)?.message || 'Unexpected error',
    }
  }
}
