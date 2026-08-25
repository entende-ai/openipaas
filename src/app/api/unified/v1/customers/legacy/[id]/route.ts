import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

/**
 * Provider-specific lookup with no unified counterpart. Kept for compatibility;
 * new integrations should reach endpoints like this through /passthrough.
 */
async function legacyHandler(
  _req: NextRequest,
  auth: UnifiedAuthContext,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const get = callable(auth.provider, 'getCustomerByLegacyId', 'legacy customer lookup')
  return ok(await get(auth.credentials, id))
}

export const GET = withUnifiedAuth(legacyHandler)
