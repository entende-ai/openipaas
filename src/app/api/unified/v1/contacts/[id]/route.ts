import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

type Ctx = { params: Promise<{ id: string }> }

async function getHandler(_req: NextRequest, auth: UnifiedAuthContext, ctx: Ctx) {
  const { id } = await ctx.params
  const get = callable(auth.provider, 'getContact', 'fetching a contact')
  return ok(await get(auth.credentials, id))
}

export const GET = withUnifiedAuth(getHandler)
