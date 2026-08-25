import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

async function handler(_req: NextRequest, auth: UnifiedAuthContext) {
  const get = callable(auth.provider, 'getConnectedAccount', 'reading the connected account')
  return ok(await get(auth.credentials))
}

export const GET = withUnifiedAuth(handler)
