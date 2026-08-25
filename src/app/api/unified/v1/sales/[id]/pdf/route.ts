import { NextRequest, NextResponse } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable } from '@/lib/route-helpers'

/**
 * Binary endpoint: bypasses the JSON helper but still goes through the provider,
 * so it inherits rate limiting, retries and refresh-and-replay on 401.
 */
async function handler(
  _req: NextRequest,
  auth: UnifiedAuthContext,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const getPdf = callable<(c: unknown, id: string) => Promise<ArrayBuffer>>(
    auth.provider,
    'getSalePdf',
    'downloading a sale PDF'
  )

  const buffer = await getPdf(auth.credentials, id)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sale_${encodeURIComponent(id)}.pdf"`,
    },
  })
}

export const GET = withUnifiedAuth(handler)
