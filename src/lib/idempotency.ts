import crypto from 'crypto';
import prisma from './prisma';

/**
 * Idempotent writes.
 *
 * A client retrying a POST after a timeout must not create a second sale. The
 * first response for an Idempotency-Key is stored and replayed; reusing the same
 * key with a different body is a client error, not a silent overwrite.
 */

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export function hashRequest(endpoint: string, body: unknown): string {
  return crypto
    .createHash('sha256')
    .update(`${endpoint}:${JSON.stringify(body ?? null)}`, 'utf8')
    .digest('hex');
}

export type IdempotencyLookup =
  | { outcome: 'MISS' }
  | { outcome: 'REPLAY'; status: number; body: unknown }
  | { outcome: 'CONFLICT' };

export async function lookup(params: {
  clientId: string;
  key: string;
  endpoint: string;
  body: unknown;
}): Promise<IdempotencyLookup> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { clientId_key: { clientId: params.clientId, key: params.key } },
  });

  if (!existing) return { outcome: 'MISS' };

  if (existing.requestHash !== hashRequest(params.endpoint, params.body)) {
    return { outcome: 'CONFLICT' };
  }

  return { outcome: 'REPLAY', status: existing.status, body: existing.responseBody };
}

export async function remember(params: {
  clientId: string;
  key: string;
  endpoint: string;
  body: unknown;
  status: number;
  responseBody: unknown;
}): Promise<void> {
  const requestHash = hashRequest(params.endpoint, params.body);

  await prisma.idempotencyKey
    .upsert({
      where: { clientId_key: { clientId: params.clientId, key: params.key } },
      create: {
        clientId: params.clientId,
        key: params.key,
        endpoint: params.endpoint,
        requestHash,
        status: params.status,
        responseBody: params.responseBody as any,
      },
      // A concurrent duplicate already stored the outcome; keep the first one.
      update: {},
    })
    .catch((err) => console.error('[Idempotency] could not persist key:', err?.message));
}

/** Housekeeping for the retention window; call from a scheduled job. */
export async function purgeExpired(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const { count } = await prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - olderThanMs) } },
  });
  return count;
}
