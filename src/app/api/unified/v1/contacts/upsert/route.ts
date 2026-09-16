import { NextRequest } from 'next/server'
import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth'
import { callable, ok } from '@/lib/route-helpers'
import { readUpsertBody } from '@/lib/route-match'

/**
 * POST /contacts/upsert
 *
 *   { "field": "email", "value": "ana@example.com", "data": { "name": "Ana" } }
 *
 * Create the contact, or update it if the match already finds one. The caller
 * does not have to know which, which is the whole point: guessing means calling
 * create, catching a provider-specific duplicate error and retrying as update.
 *
 * Answers 200 when it updated and 201 when it created, and says so in the body
 * too, because a sync needs to count what it added.
 */
async function handler(_req: NextRequest, auth: UnifiedAuthContext) {
  const { match, data } = readUpsertBody(auth.body)

  const upsert = callable(auth.provider, 'upsertContact', 'upserting contacts')
  const result = await upsert(auth.credentials, match, data)

  return ok(result, result.created ? 201 : 200)
}

export const POST = withUnifiedAuth(handler)
