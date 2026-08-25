import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

async function handler(_req: NextRequest, auth: UnifiedAuthContext) {
  const list = callable(auth.provider, 'listCategories', 'listing product categories')
  return ok(await list(auth.credentials, auth.params))
}

export const GET = withUnifiedAuth(handler)
