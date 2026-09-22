import crypto from 'crypto';
import prisma from './prisma';
import { decrypt, encrypt } from './crypto';
import { findManifest } from './providers/core/manifests';

/**
 * Outbound webhooks.
 *
 * Deliveries are persisted before they are attempted, so a crash mid-send leaves
 * a retryable row rather than a lost event. Retries use exponential backoff and
 * are driven by `deliverPending`, which a scheduled job calls.
 */

/**
 * The events this platform emits.
 *
 * Only connection lifecycle for now, and the list says exactly that. There were
 * data events here (`customer.created` and friends) that nothing ever emitted:
 * an endpoint could subscribe to them and wait forever, which is worse than not
 * offering them. They come back when something produces them.
 */
export type UnifiedEventType = 'connection.connected' | 'connection.expired' | 'connection.disconnected';

export const EVENT_TYPES: UnifiedEventType[] = [
  'connection.connected',
  'connection.expired',
  'connection.disconnected',
];

export const EVENT_DESCRIPTIONS: Record<UnifiedEventType, string> = {
  'connection.connected': 'An account was connected, or reconnected after expiring.',
  'connection.expired':
    'A connection stopped working and needs reauthorizing. Sent once per hour per connection while it stays broken.',
  'connection.disconnected': 'A connection was removed. Calls naming it will fail from now on.',
};

export function isEventType(value: string): value is UnifiedEventType {
  return (EVENT_TYPES as string[]).includes(value);
}

export const SIGNATURE_HEADER = 'X-OpenIpaas-Signature';
export const TIMESTAMP_HEADER = 'X-OpenIpaas-Timestamp';

const MAX_ATTEMPTS = 6;

/**
 * HMAC over `timestamp.body`.
 *
 * The timestamp is inside the signed payload so a captured delivery cannot be
 * replayed later with a fresh header.
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export function verifySignature(params: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  toleranceMs?: number;
}): boolean {
  const age = Math.abs(Date.now() - Number(params.timestamp));
  if (!Number.isFinite(age) || age > (params.toleranceMs ?? 5 * 60 * 1000)) return false;

  const expected = signPayload(params.secret, params.timestamp, params.body);
  const a = Buffer.from(params.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function createEndpoint(params: { clientId: string; url: string; events: UnifiedEventType[] }) {
  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      clientId: params.clientId,
      url: params.url,
      secret: encrypt(secret),
      events: params.events,
    },
  });

  // Returned once, like an API key.
  return { endpoint, secret };
}

/**
 * Queues an event for every endpoint of this client subscribed to its type.
 *
 * `dedupeKey` with `dedupeWindowMs` drops an event an endpoint already received
 * recently. Expiry is the reason it exists: a broken connection fails on every
 * request, and one call per failure would be a flood the subscriber has to
 * deduplicate itself, at the volume of the caller retrying.
 */
export async function emit(params: {
  clientId: string;
  eventType: UnifiedEventType;
  payload: Record<string, unknown>;
  dedupeKey?: { field: string; value: string };
  dedupeWindowMs?: number;
}): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { clientId: params.clientId, active: true, events: { has: params.eventType } },
  });

  if (endpoints.length === 0) return 0;

  let targets = endpoints;

  if (params.dedupeKey && params.dedupeWindowMs) {
    const since = new Date(Date.now() - params.dedupeWindowMs);
    const recent = await prisma.webhookDelivery.findMany({
      where: {
        endpointId: { in: endpoints.map((endpoint) => endpoint.id) },
        eventType: params.eventType,
        createdAt: { gte: since },
        payload: { path: [params.dedupeKey.field], equals: params.dedupeKey.value },
      },
      select: { endpointId: true },
    });

    const seen = new Set(recent.map((row) => row.endpointId));
    targets = endpoints.filter((endpoint) => !seen.has(endpoint.id));
  }

  if (targets.length === 0) return 0;

  await prisma.webhookDelivery.createMany({
    data: targets.map((endpoint) => ({
      endpointId: endpoint.id,
      eventType: params.eventType,
      payload: params.payload as any,
      nextAttemptAt: new Date(),
    })),
  });

  return targets.length;
}

/** Ten minutes of the same broken connection is one event, not hundreds. */
export const EXPIRY_DEDUPE_MS = 60 * 60 * 1000;

/**
 * The one shape every connection event carries.
 *
 * Deliberately the same field names `GET /connections` uses, so a subscriber
 * can act on the event without a second vocabulary, and never has to guess
 * which connection an event is about.
 */
export async function emitConnectionEvent(params: {
  eventType: UnifiedEventType;
  linkedAccountId: string;
  reason?: string;
}): Promise<number> {
  const account = await prisma.linkedAccount.findUnique({ where: { id: params.linkedAccountId } });
  if (!account) return 0;

  const manifest = findManifest(account.provider);

  const queued = await emit({
    clientId: account.clientId,
    eventType: params.eventType,
    payload: {
      connectionId: account.id,
      service: account.provider,
      serviceName: manifest?.name ?? account.provider,
      label: account.label?.trim() || manifest?.name || account.provider,
      ...(params.reason ? { reason: params.reason } : {}),
    },
    ...(params.eventType === 'connection.expired'
      ? { dedupeKey: { field: 'connectionId', value: account.id }, dedupeWindowMs: EXPIRY_DEDUPE_MS }
      : {}),
  });

  // Nothing here waits for delivery: an event is a consequence of the work, not
  // part of it, and the retry loop owns whatever fails.
  if (queued > 0) void deliverPending().catch(() => {});

  return queued;
}

/** Backoff schedule: ~1m, 5m, 25m, 2h, 10h. */
export function nextAttemptDelayMs(attempts: number): number {
  return Math.min(60_000 * 5 ** (attempts - 1), 12 * 60 * 60 * 1000);
}

export async function deliverPending(limit = 50, fetchImpl: typeof fetch = fetch): Promise<{ delivered: number; failed: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    include: { endpoint: true },
  });

  let delivered = 0;
  let failed = 0;

  for (const item of due) {
    const attempts = item.attempts + 1;
    const timestamp = String(Date.now());
    const body = JSON.stringify({
      id: item.id,
      type: item.eventType,
      createdAt: item.createdAt.toISOString(),
      data: item.payload,
    });

    try {
      const response = await fetchImpl(item.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signPayload(decrypt(item.endpoint.secret), timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        await prisma.webhookDelivery.update({
          where: { id: item.id },
          data: { status: 'DELIVERED', attempts, responseStatus: response.status, lastAttemptAt: new Date() },
        });
        delivered += 1;
        continue;
      }

      await scheduleRetry(item.id, attempts, `HTTP ${response.status}`, response.status);
      failed += 1;
    } catch (err: any) {
      await scheduleRetry(item.id, attempts, err?.message ?? 'network error', null);
      failed += 1;
    }
  }

  return { delivered, failed };
}

async function scheduleRetry(id: string, attempts: number, error: string, responseStatus: number | null) {
  const exhausted = attempts >= MAX_ATTEMPTS;

  await prisma.webhookDelivery.update({
    where: { id },
    data: {
      status: exhausted ? 'FAILED' : 'PENDING',
      attempts,
      responseStatus,
      lastError: error.slice(0, 500),
      lastAttemptAt: new Date(),
      nextAttemptAt: exhausted ? null : new Date(Date.now() + nextAttemptDelayMs(attempts)),
    },
  });
}
