import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Client, LinkedAccount, OAuthCredential } from '@prisma/client';

import prisma from './prisma';
import { hashApiKey } from './crypto';
import { pickActiveCredential, toProviderContext } from './credentials';
import { refreshCredential } from './token-refresh';
import { recordRequest } from './request-log';
import { consumeForKey, type RateLimitVerdict } from './api-rate-limit';
import * as idempotency from './idempotency';
import { createProvider, isKnownProvider } from './providers/core/registry';
import { findManifest } from './providers/core/manifests';
import { actionForMethod, allows, describeScopes, parseScopes, resourceForPath, type ScopeResource } from './scopes';
import { ProviderError, isProviderError } from './providers/core/errors';
import type { ListParams, ProviderContext, ResourceName, UnifiedProvider } from './providers/core/types';

export interface UnifiedAuthContext {
  requestId: string;
  client: Client;
  linkedAccount: LinkedAccount;
  provider: UnifiedProvider;
  /** Decrypted credential for the connected account. */
  credentials: ProviderContext;
  /** Query string parsed into the unified list contract. */
  params: ListParams;
  /** Parsed JSON body for write methods; null otherwise. */
  body: any;
  /** What the presented key may do. Empty means everything. */
  scopes: string[];
}

type RouteCtx<P> = { params: Promise<P> };

type Handler<P> = (
  req: NextRequest,
  auth: UnifiedAuthContext,
  routeCtx: RouteCtx<P>
) => Promise<NextResponse> | NextResponse;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/* ------------------------------------------------------------------ *
 * Query parsing
 * ------------------------------------------------------------------ */

export function parseListParams(url: URL): ListParams {
  const params: ListParams = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  if (params.limit !== undefined) {
    const limit = Number(params.limit);
    params.limit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : undefined;
  }
  return params;
}

/* ------------------------------------------------------------------ *
 * Responses
 * ------------------------------------------------------------------ */

function errorResponse(error: unknown, requestId: string): { response: NextResponse; code: string } {
  if (isProviderError(error)) {
    // Only publicMessage crosses the boundary; details stay in the logs.
    return {
      response: NextResponse.json(
        { error: error.publicMessage, code: error.code, requestId },
        { status: error.status, headers: { 'X-Request-Id': requestId } }
      ),
      code: error.code,
    };
  }

  console.error(`[UnifiedAPI][${requestId}] unhandled error:`, error);
  return {
    response: NextResponse.json(
      { error: 'Internal Server Error', code: 'INTERNAL_ERROR', requestId },
      { status: 500, headers: { 'X-Request-Id': requestId } }
    ),
    code: 'INTERNAL_ERROR',
  };
}

/**
 * The 429, saying which budget ran out.
 *
 * Which one matters to whoever has to fix it: a client over budget needs fewer
 * callers or a bigger allowance, a key over budget needs its own limit raised
 * or its work spread out. Without it, both look like the same wall.
 */
function throttled(
  budget: { verdict: RateLimitVerdict; scope: 'client' | 'key' },
  requestId: string
): NextResponse {
  const subject = budget.scope === 'key' ? 'This key' : 'This client';

  return NextResponse.json(
    {
      error: `Rate limit exceeded. ${subject} may make ${budget.verdict.limit} requests per minute.`,
      code: 'RATE_LIMITED',
      requestId,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(budget.verdict.retryAfterSeconds),
        'X-RateLimit-Limit': String(budget.verdict.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Scope': budget.scope,
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 * The wrapper
 * ------------------------------------------------------------------ */

/**
 * Wraps a unified route handler with everything that must happen on every call:
 * authentication, throttling, idempotency, provider resolution, error
 * translation and request logging.
 */
export function withUnifiedAuth<P = Record<string, string>>(
  handler: Handler<P>,
  options: { /** False where the path is not one resource, as on /api/mcp. */ enforceScope?: boolean } = {}
) {
  const enforceScope = options.enforceScope ?? true;

  return async (req: NextRequest, routeCtx: RouteCtx<P>) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const url = new URL(req.url);

    let clientId: string | null = null;
    let linkedAccountId: string | null = null;
    let providerSlug: string | null = null;

    const finish = (response: NextResponse, errorCode?: string | null) => {
      recordRequest({
        requestId,
        clientId,
        linkedAccountId,
        provider: providerSlug,
        method: req.method,
        path: url.pathname,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: errorCode ?? null,
      });
      response.headers.set('X-Request-Id', requestId);
      return response;
    };

    try {
      /* -------------------------------------------------- 1. API key */

      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return finish(
          NextResponse.json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }

      const presentedKey = authHeader.slice('Bearer '.length).trim();
      const apiKeyRecord = await findApiKey(presentedKey);

      if (!apiKeyRecord) {
        return finish(
          NextResponse.json({ error: 'Invalid API Key', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }
      clientId = apiKeyRecord.clientId;

      if (apiKeyRecord.revokedAt) {
        return finish(
          NextResponse.json({ error: 'This API key has been revoked', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }
      if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt.getTime() < Date.now()) {
        return finish(
          NextResponse.json({ error: 'This API key has expired', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }

      /* -------------------------------------------------- 2. scope */

      const scopes = parseScopes(apiKeyRecord.scopes);
      const action = actionForMethod(req.method);
      const resource = resourceForPath(url.pathname);

      if (enforceScope && !allows(scopes, action, resource)) {
        return finish(
          NextResponse.json(
            {
              error: `This key is not allowed to ${action} ${resource ?? 'this resource'}. It can: ${describeScopes(scopes).toLowerCase()}.`,
              code: 'FORBIDDEN',
              requestId,
            },
            { status: 403 }
          ),
          'FORBIDDEN'
        );
      }

      /* -------------------------------------------------- 3. rate limit */

      const budget = await consumeForKey({
        clientId: apiKeyRecord.clientId,
        keyId: apiKeyRecord.id,
        keyLimit: apiKeyRecord.rateLimit,
      });
      if (!budget.verdict.allowed) return finish(throttled(budget, requestId), 'RATE_LIMITED');

      /* -------------------------------------------------- 4. connected account */

      const resolved = await resolveConnection(req, apiKeyRecord.clientId, requestId);
      if ('response' in resolved) return finish(resolved.response, resolved.code);

      const { linkedAccount } = resolved;
      linkedAccountId = linkedAccount.id;
      providerSlug = linkedAccount.provider;

      if (!isKnownProvider(linkedAccount.provider)) {
        return finish(
          NextResponse.json(
            { error: `Provider ${linkedAccount.provider} is no longer available`, code: 'NOT_SUPPORTED', requestId },
            { status: 501 }
          ),
          'NOT_SUPPORTED'
        );
      }

      const credential = pickActiveCredential(linkedAccount.credentials);
      if (!credential) {
        return finish(
          NextResponse.json(
            { error: 'This account has no stored credential. Please reconnect it.', code: 'CONFIG_ERROR', requestId },
            { status: 409 }
          ),
          'CONFIG_ERROR'
        );
      }

      /* -------------------------------------------------- 5. incremental reads */

      const updatedAfter = url.searchParams.get('updatedAfter');
      if (updatedAfter !== null && req.method === 'GET') {
        const refusal = checkUpdatedAfter(updatedAfter, linkedAccount.provider, resource, requestId);
        if (refusal) return finish(refusal.response, refusal.code);
      }

      /* -------------------------------------------------- 6. body + idempotency */

      let body: any = null;
      if (WRITE_METHODS.has(req.method)) {
        try {
          const text = await req.text();
          body = text ? JSON.parse(text) : null;
        } catch {
          return finish(
            NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_REQUEST', requestId }, { status: 400 }),
            'INVALID_REQUEST'
          );
        }
      }

      const idempotencyKey = req.headers.get(idempotency.IDEMPOTENCY_HEADER);
      if (idempotencyKey && WRITE_METHODS.has(req.method)) {
        const hit = await idempotency.lookup({
          clientId: apiKeyRecord.clientId,
          key: idempotencyKey,
          endpoint: `${req.method} ${url.pathname}`,
          body,
        });

        if (hit.outcome === 'CONFLICT') {
          return finish(
            NextResponse.json(
              { error: 'This Idempotency-Key was already used with a different request body.', code: 'INVALID_REQUEST', requestId },
              { status: 422 }
            ),
            'INVALID_REQUEST'
          );
        }
        if (hit.outcome === 'REPLAY') {
          return finish(
            NextResponse.json(hit.body as any, { status: hit.status, headers: { 'Idempotent-Replay': 'true' } })
          );
        }
      }

      /* -------------------------------------------------- 7. dispatch */

      const provider = createProvider(linkedAccount.provider, { refreshCredential });
      const credentials = toProviderContext(credential, linkedAccount.provider);

      const auth: UnifiedAuthContext = {
        requestId,
        client: linkedAccount.client,
        linkedAccount,
        provider,
        credentials,
        params: parseListParams(url),
        body,
        scopes,
      };

      const response = await handler(req, auth, routeCtx);

      // Only successful writes are worth replaying.
      if (idempotencyKey && WRITE_METHODS.has(req.method) && response.status < 400) {
        const cloned = await response.clone().json().catch(() => null);
        await idempotency.remember({
          clientId: apiKeyRecord.clientId,
          key: idempotencyKey,
          endpoint: `${req.method} ${url.pathname}`,
          body,
          status: response.status,
          responseBody: cloned,
        });
      }

      prisma.apiKey
        .update({ where: { id: apiKeyRecord.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {/* best effort */});

      return finish(response);
    } catch (error) {
      const { response, code } = errorResponse(error, requestId);
      return finish(response, code);
    }
  };
}

/**
 * Reading only what changed, or saying plainly that this one cannot.
 *
 * A provider that ignores an unknown filter answers with everything, and a
 * caller that believes it asked for a delta will treat a full table as one.
 * That is a silent, expensive wrong answer, so a resource whose provider does
 * not document the filter is refused instead.
 */
function checkUpdatedAfter(
  value: string,
  providerSlug: string,
  resource: ScopeResource | null,
  requestId: string
): { response: NextResponse; code: string } | null {
  const refuse = (status: number, code: string, error: string) => ({
    response: NextResponse.json({ error, code, requestId }, { status }),
    code,
  });

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return refuse(400, 'INVALID_REQUEST', 'updatedAfter must be an ISO-8601 instant, as in 2026-09-01T00:00:00Z.');
  }

  const manifest = findManifest(providerSlug);
  const supported = manifest?.incremental ?? [];

  if (!resource || !supported.includes(resource as ResourceName)) {
    return refuse(
      501,
      'NOT_SUPPORTED',
      `${manifest?.name ?? providerSlug} cannot filter ${resource ?? 'this resource'} by update time. ` +
        `Page the whole list instead${supported.length > 0 ? `, or use updatedAfter on: ${supported.join(', ')}` : ''}.`
    );
  }

  return null;
}

/**
 * Which of the client's connections a request is for.
 *
 * The API key is the client. Inside it, a request picks one connection either by
 * its connection token (`X-Account-Token`, exact, always works) or by the name
 * of the service (`X-Provider: RD_STATION_CRM`, readable, works while the client
 * has one account on that service). The token wins when both are sent, so a
 * caller that pinned an account keeps it.
 *
 * Every lookup is scoped to the key's own client. Another client's token and
 * another client's service are the same answer: not found here.
 */
async function resolveConnection(
  req: NextRequest,
  clientId: string,
  requestId: string
): Promise<
  | { linkedAccount: LinkedAccount & { credentials: OAuthCredential[]; client: Client } }
  | { response: NextResponse; code: string }
> {
  const refuse = (status: number, code: string, error: string) => ({
    response: NextResponse.json({ error, code, requestId }, { status }),
    code,
  });

  const accountToken = req.headers.get('X-Account-Token');

  if (accountToken) {
    const linkedAccount = await prisma.linkedAccount.findUnique({
      where: { accountToken },
      include: { credentials: true, client: true },
    });

    // Same response whether the token is unknown or belongs to another client,
    // so the endpoint cannot be used to probe for valid tokens.
    if (!linkedAccount || linkedAccount.clientId !== clientId) {
      return refuse(401, 'UNAUTHORIZED', 'Invalid X-Account-Token');
    }
    return { linkedAccount };
  }

  const requested = req.headers.get('X-Provider');

  if (!requested) {
    return refuse(
      400,
      'INVALID_REQUEST',
      'Pick a connection: send X-Provider with the service name, or X-Account-Token with the connection token.'
    );
  }

  const manifest = findManifest(requested);
  if (!manifest) {
    return refuse(
      400,
      'INVALID_REQUEST',
      `Unknown provider "${requested.trim()}". The service names are listed by GET /api/unified/v1/providers.`
    );
  }

  const matches = await prisma.linkedAccount.findMany({
    where: { clientId, provider: manifest.slug },
    include: { credentials: true, client: true },
    orderBy: { createdAt: 'asc' },
  });

  if (matches.length === 0) {
    return refuse(404, 'NOT_FOUND', `This client has no ${manifest.name} connection.`);
  }

  // Two accounts on one service is legitimate, and guessing between them would
  // write to the wrong customer's system. The token is how a caller says which.
  //
  // The candidates travel in the error body, with their tokens. That reveals
  // nothing: a connection token does nothing on its own, and this caller already
  // holds the key that reaches all of them. Without them the caller is stuck
  // until a person opens the dashboard, which is not an answer a program can act
  // on.
  if (matches.length > 1) {
    const candidates = matches.map((match) => ({
      id: match.id,
      label: match.label,
      service: match.provider,
      connectionToken: match.accountToken,
    }));

    return {
      response: NextResponse.json(
        {
          error: `This client has more than one ${manifest.name} connection. Send X-Account-Token to pick one.`,
          code: 'AMBIGUOUS_CONNECTION',
          requestId,
          connections: candidates,
        },
        { status: 409 }
      ),
      code: 'AMBIGUOUS_CONNECTION',
    };
  }

  return { linkedAccount: matches[0] };
}

/**
 * Looks a key up by hash, falling back to the legacy plaintext column for keys
 * issued before hashing. The fallback disappears with the contract migration.
 */
async function findApiKey(presentedKey: string) {
  const byHash = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(presentedKey) },
    include: { client: true },
  });
  if (byHash) return byHash;

  return prisma.apiKey.findUnique({ where: { key: presentedKey }, include: { client: true } });
}

/** Shared helper so routes can raise the standard not-supported error. */
export function assertCapability(provider: UnifiedProvider, method: keyof UnifiedProvider, label: string) {
  if (typeof provider[method] !== 'function') {
    throw new ProviderError('NOT_SUPPORTED', `Provider ${provider.manifest.name} does not support ${label}.`, {
      provider: provider.manifest.slug,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Client scope
 * ------------------------------------------------------------------ */

export interface ClientConnection {
  linkedAccount: LinkedAccount;
  provider: UnifiedProvider;
  credentials: ProviderContext;
}

export interface ClientAuthContext {
  requestId: string;
  client: Client;
  /** Every connection of this client that is usable right now. */
  connections: ClientConnection[];
  /**
   * Every connection, usable or not, in the order they were connected.
   *
   * `connections` answers "what can I call"; this answers "what does this client
   * have", which is a different question and the only one a listing can answer
   * honestly: a connection whose credential died has to appear, or the caller
   * cannot tell it apart from one that was never made.
   */
  accounts: (LinkedAccount & { credentials: OAuthCredential[] })[];
  /**
   * What the presented key may do. Empty means everything.
   *
   * Enforced by the caller rather than here: a client-scoped request is not one
   * resource, so what a scope means depends on what is being asked. A listing
   * checks one pair; the MCP server filters its tools instead, which is a
   * better answer than a tool that exists and always fails.
   */
  scopes: string[];
  body: any;
}

type ClientHandler = (req: NextRequest, auth: ClientAuthContext) => Promise<NextResponse> | NextResponse;

/**
 * The same authentication, scoped to the client rather than one connection.
 *
 * An API key already identifies a client, and already reaches any of that
 * client's connections given the matching account token. This grants nothing
 * new: it drops the second header and hands over every connection at once, for
 * a caller that would otherwise need one endpoint per connected account.
 *
 * A connection with no usable credential is left out rather than reported. It
 * is not an error for the caller, who did not ask for it by name; it is
 * something for the dashboard to show the operator, which it does.
 */
export function withClientAuth(handler: ClientHandler) {
  return async (req: NextRequest) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const url = new URL(req.url);

    let clientId: string | null = null;

    const finish = (response: NextResponse, errorCode?: string | null) => {
      recordRequest({
        requestId,
        clientId,
        linkedAccountId: null,
        provider: null,
        method: req.method,
        path: url.pathname,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: errorCode ?? null,
      });
      response.headers.set('X-Request-Id', requestId);
      return response;
    };

    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return finish(
          NextResponse.json(
            { error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED', requestId },
            { status: 401 }
          ),
          'UNAUTHORIZED'
        );
      }

      const apiKeyRecord = await findApiKey(authHeader.slice('Bearer '.length).trim());

      if (!apiKeyRecord) {
        return finish(
          NextResponse.json({ error: 'Invalid API Key', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }
      clientId = apiKeyRecord.clientId;

      if (apiKeyRecord.revokedAt) {
        return finish(
          NextResponse.json({ error: 'This API key has been revoked', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }
      if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt.getTime() < Date.now()) {
        return finish(
          NextResponse.json({ error: 'This API key has expired', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }

      const budget = await consumeForKey({
        clientId: apiKeyRecord.clientId,
        keyId: apiKeyRecord.id,
        keyLimit: apiKeyRecord.rateLimit,
      });
      if (!budget.verdict.allowed) return finish(throttled(budget, requestId), 'RATE_LIMITED');

      const client = await prisma.client.findUnique({ where: { id: apiKeyRecord.clientId } });
      if (!client) {
        return finish(
          NextResponse.json({ error: 'Invalid API Key', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }

      const linkedAccounts = await prisma.linkedAccount.findMany({
        where: { clientId: client.id },
        include: { credentials: true },
        orderBy: { createdAt: 'asc' },
      });

      const connections: ClientConnection[] = [];
      for (const linkedAccount of linkedAccounts) {
        if (!isKnownProvider(linkedAccount.provider)) continue;

        const credential = pickActiveCredential(linkedAccount.credentials);
        if (!credential) continue;

        connections.push({
          linkedAccount,
          provider: createProvider(linkedAccount.provider, { refreshCredential }),
          credentials: toProviderContext(credential, linkedAccount.provider),
        });
      }

      let body: any = null;
      if (WRITE_METHODS.has(req.method)) {
        try {
          const text = await req.text();
          body = text ? JSON.parse(text) : null;
        } catch {
          return finish(
            NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_REQUEST', requestId }, { status: 400 }),
            'INVALID_REQUEST'
          );
        }
      }

      const response = await handler(req, {
        requestId,
        client,
        connections,
        accounts: linkedAccounts,
        scopes: parseScopes(apiKeyRecord.scopes),
        body,
      });

      prisma.apiKey
        .update({ where: { id: apiKeyRecord.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {/* best effort */});

      return finish(response);
    } catch (error) {
      const { response, code } = errorResponse(error, requestId);
      return finish(response, code);
    }
  };
}
