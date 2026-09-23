import crypto from 'crypto';
import type { ConnectSession } from '@prisma/client';

import prisma from './prisma';
import { appUrl } from './oauth';
import { mintConnectToken, readConnectToken } from './connect-token';
import { listManifests } from './providers/core/manifests';

/**
 * Delegated connecting.
 *
 * Everything else about a client can be done through the admin API. Connecting
 * an account could not: it meant someone opening this console, picking the
 * client out of a list of every client in the deployment, and finishing the
 * provider's consent. An end customer of our customer should not see that
 * screen, and usually must not.
 *
 * A connect session is a one-time invitation. The product creates one for its
 * own customer, sends them to a page we host, and hears back through a webhook
 * or by asking. The token in that link is the authority to attach an account to
 * exactly one client, so it is short lived, single use, and stored hashed.
 */

export const SESSION_TTL_MS = 30 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export interface CreateSessionInput {
  clientId: string;
  /** Pins one service. Omitted lets the customer choose. */
  provider?: string | null;
  redirectUrl?: string | null;
  /** Origins allowed to frame the page and receive its messages. */
  origins?: string[];
  label?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
}

export interface CreatedSession {
  id: string;
  token: string;
  url: string;
  expiresAt: Date;
}

/** An https URL, or a reason it is not one. */
export function readUrl(raw: unknown, field: string): { value: string } | { error: string } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { error: `${field} is required.` };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: `${field} must be an absolute URL.` };
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    return { error: `${field} must be https, except on localhost.` };
  }

  return { value: parsed.toString() };
}

/** Just the origin part, which is all a frame-ancestors or a postMessage wants. */
export function readOrigin(raw: unknown): { value: string } | { error: string } {
  const parsed = readUrl(raw, 'origin');
  if ('error' in parsed) return parsed;

  return { value: new URL(parsed.value).origin };
}

export async function createConnectSession(input: CreateSessionInput): Promise<CreatedSession> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const origins = input.origins ?? [];

  // The claims travel in the token because the proxy has to read the origins
  // before any database is reachable. The row is still the authority on whether
  // this session may be used.
  const token = await mintConnectToken({ sid: id, org: origins, exp: expiresAt.getTime() });

  await prisma.connectSession.create({
    data: {
      id,
      clientId: input.clientId,
      tokenHash: hashToken(token),
      provider: input.provider ?? null,
      redirectUrl: input.redirectUrl ?? null,
      origins,
      label: input.label ?? null,
      logoUrl: input.logoUrl ?? null,
      accentColor: input.accentColor ?? null,
      expiresAt,
    },
  });

  return { id, token, url: `${appUrl()}/connect/${token}`, expiresAt };
}

export type SessionState =
  | { state: 'ok'; session: ConnectSession }
  | { state: 'invalid' }
  | { state: 'expired'; session: ConnectSession }
  | { state: 'used'; session: ConnectSession };

/**
 * The session behind a token, and whether it can still be used.
 *
 * Three refusals rather than one, because the page can say something useful
 * about each: a link that was already used is a different message from a link
 * that never existed, and a customer who sees the wrong one calls support.
 */
export async function resolveConnectSession(token: string): Promise<SessionState> {
  const claims = await readConnectToken(token);
  if (!claims) return { state: 'invalid' };

  const session = await prisma.connectSession.findUnique({ where: { id: claims.sid } });
  if (!session) return { state: 'invalid' };

  // The signature proves the claims were ours; this proves the token is the one
  // that was handed out, so a leaked database is not a set of live links.
  if (session.tokenHash !== hashToken(token)) return { state: 'invalid' };

  if (session.usedAt) return { state: 'used', session };
  if (session.expiresAt.getTime() <= Date.now()) return { state: 'expired', session };

  return { state: 'ok', session };
}

/**
 * Marks a session finished and records what it produced.
 *
 * Conditional on `usedAt` being null, so two tabs racing produce one connection
 * and one refusal rather than two connections.
 */
export async function completeConnectSession(id: string, linkedAccountId: string): Promise<boolean> {
  const { count } = await prisma.connectSession.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date(), linkedAccountId },
  });

  return count > 0;
}

/** What the hosted page offers: one pinned service, or everything connectable. */
export function offeredProviders(session: Pick<ConnectSession, 'provider'>) {
  const enabled = listManifests({ enabledOnly: true });

  return session.provider ? enabled.filter((manifest) => manifest.slug === session.provider) : enabled;
}

/**
 * Where the browser goes when it is over.
 *
 * The status travels in the query rather than only in a message, so a plain
 * redirect (no iframe, no popup, an in-app browser that blocks both) still
 * tells the product what happened.
 */
export function outcomeUrl(session: ConnectSession, outcome: 'connected' | 'cancelled' | 'failed'): string | null {
  if (!session.redirectUrl) return null;

  const url = new URL(session.redirectUrl);
  url.searchParams.set('status', outcome);
  url.searchParams.set('session', session.id);
  if (outcome === 'connected' && session.linkedAccountId) {
    url.searchParams.set('connection', session.linkedAccountId);
  }

  return url.toString();
}
