"use server"

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { requireDashboardSession, requireOwner } from '@/lib/auth-session'
import { createEndpoint, EVENT_TYPES, isEventType, type UnifiedEventType } from '@/lib/webhooks'

/**
 * Registering where a client wants to be told things.
 *
 * The secret is shown once, like an API key, because it is stored encrypted and
 * the point of it is that the receiver can prove a delivery came from here.
 */

function readUrl(raw: string): { url: string } | { error: string } {
  const value = raw.trim()
  if (!value) return { error: 'The URL is required.' }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { error: 'That is not a URL. It needs the scheme too, as in https://example.com/hooks.' }
  }

  // Plain HTTP would put the payload, and the signature proving it is ours, on
  // the wire in the clear.
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    return { error: 'Use https. Only localhost may be plain http, for development.' }
  }

  return { url: parsed.toString() }
}

export async function addWebhookEndpoint(formData: FormData) {
  await requireDashboardSession()

  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return { error: 'Pick a client.' }

  const parsed = readUrl(String(formData.get('url') ?? ''))
  if ('error' in parsed) return parsed

  const events = formData.getAll('events').map(String).filter(isEventType) as UnifiedEventType[]
  if (events.length === 0) return { error: 'Pick at least one event.' }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) return { error: 'That client no longer exists.' }

  const { secret } = await createEndpoint({ clientId, url: parsed.url, events })

  revalidatePath('/dashboard/webhooks')
  return { success: true as const, secret, warning: 'Copy this signing secret now. It cannot be shown again.' }
}

export async function setWebhookEndpointActive(id: string, active: boolean) {
  await requireDashboardSession()

  await prisma.webhookEndpoint.update({ where: { id }, data: { active } })
  revalidatePath('/dashboard/webhooks')
  return { success: true as const }
}

/** Removing an endpoint takes its delivery history with it, so it is an owner call. */
export async function deleteWebhookEndpoint(id: string) {
  await requireOwner()

  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id }, select: { id: true } })
  if (!endpoint) return { error: 'That endpoint no longer exists.' }

  await prisma.webhookEndpoint.delete({ where: { id } })
  revalidatePath('/dashboard/webhooks')
  return { success: true as const }
}

/** The event names, for a form that must not invent one. */
export async function listEventTypes() {
  return EVENT_TYPES
}
