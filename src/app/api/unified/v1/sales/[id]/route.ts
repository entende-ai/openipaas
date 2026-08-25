import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

async function handler(
  _req: NextRequest,
  auth: UnifiedAuthContext,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const get = callable(auth.provider, 'getSale', 'fetching a sale')
  return ok(await get(auth.credentials, id))
}

export const GET = withUnifiedAuth(handler)
