import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

async function handler(_req: NextRequest, auth: UnifiedAuthContext) {
  const list = callable(auth.provider, 'listUnits', 'listing units of measure')
  return ok(await list(auth.credentials, auth.params))
}

export const GET = withUnifiedAuth(handler)
