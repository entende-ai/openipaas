import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

async function listHandler(_req: NextRequest, auth: UnifiedAuthContext) {
  const list = callable(auth.provider, 'listProducts', 'listing products')
  return ok(await list(auth.credentials, auth.params))
}

async function createHandler(_req: NextRequest, auth: UnifiedAuthContext) {
  const create = callable(auth.provider, 'createProduct', 'creating products')
  return ok(await create(auth.credentials, auth.body), 201)
}

export const GET = withUnifiedAuth(listHandler)
export const POST = withUnifiedAuth(createHandler)
