import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import prisma from './prisma';
import { hashApiKey } from './crypto';
import { recordRequest } from './request-log';
import { consume, DEFAULT_LIMIT, DEFAULT_WINDOW_MS } from './api-rate-limit';

/**
 * The credential that crosses clients.
 *
 * Everything else in this platform is scoped to one client by construction: a
 * key is a client, and no request can leave it. This is the one exception, so
 * it is a separate wrapper over a separate table with a separate prefix, and
 * the two can never be swapped by accident: a client key presented here is
 * refused exactly like a made-up one, and an admin key is not an ApiKey row, so
 * the unified API cannot accept it at all.
 *
 * It exists so that "a new company signed up" is a step a program can take
 * instead of a person in a dashboard.
 */

export interface AdminAuthContext {
  requestId: string;
  adminKeyId: string;
  body: any;
}

type AdminHandler<P> = (
  req: NextRequest,
  auth: AdminAuthContext,
  routeCtx: { params: Promise<P> }
) => Promise<NextResponse> | NextResponse;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function adminError(status: number, code: string, error: string, requestId: string) {
  return NextResponse.json({ error, code, requestId }, { status });
}

export function withAdminAuth<P = Record<string, string>>(handler: AdminHandler<P>) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const url = new URL(req.url);

    const finish = (response: NextResponse, errorCode?: string | null) => {
      recordRequest({
        requestId,
        clientId: null,
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
      const header = req.headers.get('Authorization');
      if (!header?.startsWith('Bearer ')) {
        return finish(adminError(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header', requestId), 'UNAUTHORIZED');
      }

      const presented = header.slice('Bearer '.length).trim();
      const record = await prisma.adminKey.findUnique({ where: { keyHash: hashApiKey(presented) } });

      // A client key lands here too, and gets this same answer: whether a key
      // exists is not something an unauthenticated caller gets to learn.
      if (!record || record.revokedAt) {
        return finish(adminError(401, 'UNAUTHORIZED', 'Invalid admin key', requestId), 'UNAUTHORIZED');
      }

      const verdict = await consume(`admin:${record.id}`, DEFAULT_LIMIT, DEFAULT_WINDOW_MS);
      if (!verdict.allowed) {
        return finish(
          NextResponse.json(
            { error: 'Rate limit exceeded', code: 'RATE_LIMITED', requestId },
            { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } }
          ),
          'RATE_LIMITED'
        );
      }

      let body: any = null;
      if (WRITE_METHODS.has(req.method)) {
        try {
          const text = await req.text();
          body = text ? JSON.parse(text) : null;
        } catch {
          return finish(adminError(400, 'INVALID_REQUEST', 'Invalid JSON body', requestId), 'INVALID_REQUEST');
        }
      }

      const response = await handler(req, { requestId, adminKeyId: record.id, body }, routeCtx);

      prisma.adminKey
        .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {/* best effort */});

      return finish(response);
    } catch (error) {
      console.error(`[AdminAPI][${requestId}] unhandled error:`, error);
      return finish(adminError(500, 'INTERNAL_ERROR', 'Internal Server Error', requestId), 'INTERNAL_ERROR');
    }
  };
}

/** A name a person will read later, or a refusal saying why not. */
export function readName(value: unknown, field = 'name'): { value: string } | { error: string } {
  const name = typeof value === 'string' ? value.trim() : '';

  if (!name) return { error: `${field} is required.` };
  if (name.length > 120) return { error: `Keep ${field} under 120 characters.` };

  return { value: name };
}
