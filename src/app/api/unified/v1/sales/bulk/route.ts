import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

async function handler(_req: NextRequest, auth: UnifiedAuthContext) {
  const run = callable(auth.provider, 'bulkDeleteSales', 'bulk deletion of sales')
  return ok(await run(auth.credentials, auth.body?.ids))
}

export const POST = withUnifiedAuth(handler)
export const DELETE = withUnifiedAuth(handler)
