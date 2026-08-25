import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

type Ctx = { params: Promise<{ id: string }> }

async function getHandler(_req: NextRequest, auth: UnifiedAuthContext, ctx: Ctx) {
  const { id } = await ctx.params
  const get = callable(auth.provider, 'getCustomer', 'fetching a customer')
  return ok(await get(auth.credentials, id))
}

async function updateHandler(_req: NextRequest, auth: UnifiedAuthContext, ctx: Ctx) {
  const { id } = await ctx.params
  const update = callable(auth.provider, 'updateCustomer', 'updating customers')
  return ok(await update(auth.credentials, id, auth.body))
}

export const GET = withUnifiedAuth(getHandler)
export const PUT = withUnifiedAuth(updateHandler)
export const PATCH = withUnifiedAuth(updateHandler)
