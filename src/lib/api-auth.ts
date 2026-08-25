import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Client, LinkedAccount } from '@prisma/client';

import prisma from './prisma';
import { hashApiKey } from './crypto';
import { pickActiveCredential, toProviderContext } from './credentials';
import { refreshCredential } from './token-refresh';
import { recordRequest } from './request-log';
import { consume, DEFAULT_LIMIT, DEFAULT_WINDOW_MS } from './api-rate-limit';
import * as idempotency from './idempotency';
import { createProvider, isKnownProvider } from './providers/core/registry';
import { ProviderError, isProviderError } from './providers/core/errors';
import type { ListParams, ProviderContext, UnifiedProvider } from './providers/core/types';

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

/* ------------------------------------------------------------------ *
 * The wrapper
 * ------------------------------------------------------------------ */

/**
 * Wraps a unified route handler with everything that must happen on every call:
 * authentication, throttling, idempotency, provider resolution, error
 * translation and request logging.
 */
export function withUnifiedAuth<P = Record<string, string>>(handler: Handler<P>) {
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

      /* -------------------------------------------------- 2. rate limit */

      const verdict = await consume(`client:${apiKeyRecord.clientId}`, DEFAULT_LIMIT, DEFAULT_WINDOW_MS);
      if (!verdict.allowed) {
        return finish(
          NextResponse.json(
            { error: 'Rate limit exceeded', code: 'RATE_LIMITED', requestId },
            {
              status: 429,
              headers: {
                'Retry-After': String(verdict.retryAfterSeconds),
                'X-RateLimit-Limit': String(verdict.limit),
                'X-RateLimit-Remaining': '0',
              },
            }
          ),
          'RATE_LIMITED'
        );
      }

      /* -------------------------------------------------- 3. connected account */

      const accountToken = req.headers.get('X-Account-Token');
      if (!accountToken) {
        return finish(
          NextResponse.json({ error: 'Missing X-Account-Token header', code: 'INVALID_REQUEST', requestId }, { status: 400 }),
          'INVALID_REQUEST'
        );
      }

      const linkedAccount = await prisma.linkedAccount.findUnique({
        where: { accountToken },
        include: { credentials: true, client: true },
      });

      // Same response whether the token is unknown or belongs to another client,
      // so the endpoint cannot be used to probe for valid tokens.
      if (!linkedAccount || linkedAccount.clientId !== apiKeyRecord.clientId) {
        return finish(
          NextResponse.json({ error: 'Invalid X-Account-Token', code: 'UNAUTHORIZED', requestId }, { status: 401 }),
          'UNAUTHORIZED'
        );
      }
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

      /* -------------------------------------------------- 4. body + idempotency */

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

      /* -------------------------------------------------- 5. dispatch */

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
