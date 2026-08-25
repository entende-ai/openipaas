import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'

/**
 * Escape hatch: calls the connected provider's own API with our credential
 * handling, throttling and retries applied.
 *
 * This is what lets a provider ship before its unified mappers exist, and what
 * keeps customers unblocked when they need a field the unified model omits.
 *
 *   GET /api/unified/v1/passthrough/pessoas?pagina=1
 *     -> GET https://api-v2.contaazul.com/v1/pessoas?pagina=1
 */
async function handler(
  req: NextRequest,
  auth: UnifiedAuthContext,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params
  const url = new URL(req.url)

  const query: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) query[key] = value

  const call = callable(auth.provider, 'passthrough', 'passthrough requests')
  const result = await call(auth.credentials, {
    method: req.method,
    path: `/${(path ?? []).join('/')}`,
    query,
    body: auth.body,
  })

  return ok(result.body, result.status)
}

export const GET = withUnifiedAuth(handler)
export const POST = withUnifiedAuth(handler)
export const PUT = withUnifiedAuth(handler)
export const PATCH = withUnifiedAuth(handler)
export const DELETE = withUnifiedAuth(handler)
