import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

type Ctx = { params: Promise<{ id: string }> }

async function getHandler(_req: NextRequest, auth: UnifiedAuthContext, ctx: Ctx) {
  const { id } = await ctx.params
  const get = callable(auth.provider, 'getProduct', 'fetching a product')
  return ok(await get(auth.credentials, id))
}

async function updateHandler(_req: NextRequest, auth: UnifiedAuthContext, ctx: Ctx) {
  const { id } = await ctx.params
  const update = callable(auth.provider, 'updateProduct', 'updating products')
  return ok(await update(auth.credentials, id, auth.body))
}

async function deleteHandler(_req: NextRequest, auth: UnifiedAuthContext, ctx: Ctx) {
  const { id } = await ctx.params
  const remove = callable(auth.provider, 'deleteProduct', 'deleting products')
  await remove(auth.credentials, id)
  return ok({ deleted: true, id })
}

export const GET = withUnifiedAuth(getHandler)
export const PUT = withUnifiedAuth(updateHandler)
export const PATCH = withUnifiedAuth(updateHandler)
export const DELETE = withUnifiedAuth(deleteHandler)
