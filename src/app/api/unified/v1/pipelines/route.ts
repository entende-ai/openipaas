import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

/**
 * Pipelines carry their stages, because a stage means nothing on its own: a
 * deal's stage id is only interpretable against the pipeline it belongs to.
 */
async function listHandler(_req: NextRequest, auth: UnifiedAuthContext) {
  const list = callable(auth.provider, 'listPipelines', 'listing pipelines')
  return ok(await list(auth.credentials, auth.params))
}

export const GET = withUnifiedAuth(listHandler)
