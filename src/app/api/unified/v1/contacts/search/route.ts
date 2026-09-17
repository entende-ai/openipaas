import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'
import { readMatch } from '@/lib/route-match'

/**
 * GET /contacts/search?field=email&value=someone@example.com
 *
 * Finding a contact by something the caller actually has. A CRM id is not it:
 * the caller has an email address, which is why upsert exists at all.
 *
 * A static segment wins over /contacts/[id] in the App Router, and provider
 * ids are 24-character hex, so "search" can never be one.
 */
async function handler(req: NextRequest, auth: UnifiedAuthContext) {
  const match = readMatch(new URL(req.url).searchParams)

  const search = callable(auth.provider, 'searchContacts', 'searching contacts')
  return ok(await search(auth.credentials, match))
}

export const GET = withUnifiedAuth(handler)
