"use server"

import prisma from '@/lib/prisma'
import { toStoredCredential } from '@/lib/credentials'
import { getManifest, isKnownProvider } from '@/lib/providers/core/registry'
import {
  completeConnectSession,
  createConnectSession,
  readOrigin,
  readUrl,
  resolveConnectSession,
} from '@/lib/connect-session'
import { connectSecretConfigured } from '@/lib/connect-token'
import { findManifest } from '@/lib/providers/core/manifests'
import { requireDashboardSession } from '@/lib/auth-session'
import { emitConnectionEvent } from '@/lib/webhooks'

/**
 * Connecting a key-based provider from the hosted page.
 *
 * The dashboard has an action for this already, but that one starts with
 * `requireDashboardSession`: it is written for us, and the person here is not
 * us. The only thing that says this browser may attach an account to this
 * client is the session token, so it is resolved again on the server, and the
 * client id comes from the row rather than from the form. A form field naming a
 * client would be a way to write into any client in the deployment.
 */
export async function submitConnectCredentials(
  token: string,
  providerSlug: string,
  formData: FormData
): Promise<{ connectionId?: string; error?: string }> {
  const resolved = await resolveConnectSession(token)
  if (resolved.state === 'invalid') return { error: 'This link is not valid.' }
  if (resolved.state === 'expired') return { error: 'This link has expired. Ask for a new one.' }
  if (resolved.state === 'used') return { error: 'This link was already used.' }

  const { session } = resolved
  const provider = providerSlug.toUpperCase()

  if (!isKnownProvider(provider)) return { error: 'That service is not available here.' }
  // A session pinned to one service may not be talked into another one.
  if (session.provider && session.provider !== provider) return { error: 'That service is not available here.' }

  const manifest = getManifest(provider)
  if (manifest.auth.type === 'OAUTH2') return { error: 'That service is connected through its own sign-in window.' }

  const secrets: Record<string, string> = {}
  for (const field of manifest.auth.fields) {
    const value = (formData.get(field.key) as string | null)?.trim()
    if (field.required && !value) return { error: `${field.label} is required.` }
    if (value) secrets[field.key] = value
  }

  const accessToken = secrets[manifest.auth.fields[0]?.key] ?? ''
  if (!accessToken) return { error: 'Missing credentials.' }

  const linkedAccount = await prisma.linkedAccount.create({
    data: {
      clientId: session.clientId,
      provider,
      label: manifest.name,
      credentials: {
        create: {
          authType: manifest.auth.type,
          ...toStoredCredential({ accessToken, secrets }),
        },
      },
    },
  })

  // Burned before anything is announced. If two tabs submitted the same link,
  // the loser's account is removed rather than left behind as a connection
  // nobody asked for and nobody can see.
  const claimed = await completeConnectSession(session.id, linkedAccount.id)
  if (!claimed) {
    await prisma.linkedAccount.delete({ where: { id: linkedAccount.id } })
    return { error: 'This link was already used.' }
  }

  await emitConnectionEvent({ eventType: 'connection.connected', linkedAccountId: linkedAccount.id })

  return { connectionId: linkedAccount.id }
}

/**
 * A connect link, made from the console.
 *
 * The admin API is the way a product does this in production, but a person who
 * has just added a client should not have to issue an admin key and reach for
 * curl to try the flow once. Same session check as the rest of the dashboard,
 * and the same session row underneath, so what is tested here is what ships.
 */
export async function createConnectLink(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireDashboardSession()

  if (!connectSecretConfigured()) {
    return { error: 'DASHBOARD_SESSION_SECRET is not set, so connect links cannot be signed.' }
  }

  const clientId = (formData.get('clientId') as string | null)?.trim()
  if (!clientId) return { error: 'Select a client.' }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) return { error: 'That client no longer exists.' }

  const providerRaw = (formData.get('provider') as string | null)?.trim()
  let provider: string | null = null
  if (providerRaw) {
    const manifest = findManifest(providerRaw)
    if (!manifest) return { error: `Unknown provider ${providerRaw}.` }
    provider = manifest.slug
  }

  const origins: string[] = []
  const originRaw = (formData.get('origin') as string | null)?.trim()
  if (originRaw) {
    const parsed = readOrigin(originRaw)
    if ('error' in parsed) return { error: parsed.error }
    origins.push(parsed.value)
  }

  const redirectRaw = (formData.get('redirectUrl') as string | null)?.trim()
  let redirectUrl: string | null = null
  if (redirectRaw) {
    const parsed = readUrl(redirectRaw, 'Return URL')
    if ('error' in parsed) return { error: parsed.error }
    redirectUrl = parsed.value
  }

  const session = await createConnectSession({
    clientId,
    provider,
    origins,
    redirectUrl,
    label: (formData.get('label') as string | null)?.trim() || null,
  })

  return { url: session.url }
}
