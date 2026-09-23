import crypto from 'crypto';
import prisma from './prisma';
import { getManifest } from './providers/core/registry';
import { ProviderError } from './providers/core/errors';
import { resolveOAuthClient } from './token-refresh';

const STATE_TTL_MS = 10 * 60 * 1000;

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
}

export function redirectUriFor(slug: string): string {
  return `${appUrl()}/api/oauth/callback/${slug.toLowerCase().replace(/_/g, '-')}`;
}

/** Reverses redirectUriFor, so one callback route serves every provider. */
export function slugFromCallbackSegment(segment: string): string {
  return segment.toUpperCase().replace(/-/g, '_');
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/**
 * Starts an authorization-code flow.
 *
 * The `state` is a single-use random value persisted server-side, not the
 * client id: a guessable state lets anyone forge a callback and attach their own
 * ERP account to someone else's client.
 */
export async function beginOAuthFlow(params: {
  providerSlug: string;
  clientId: string;
  /** Set when an end customer started this from a hosted connect link. */
  connectSessionId?: string | null;
}): Promise<{ authorizationUrl: string; state: string }> {
  const manifest = getManifest(params.providerSlug);

  if (manifest.auth.type !== 'OAUTH2') {
    throw new ProviderError('INVALID_REQUEST', `${manifest.name} does not use an OAuth flow.`);
  }

  const client = await prisma.client.findUnique({ where: { id: params.clientId } });
  if (!client) {
    throw new ProviderError('INVALID_REQUEST', 'Unknown client.');
  }

  const { clientId: appClientId } = resolveOAuthClient(manifest.slug);
  const redirectUri = redirectUriFor(manifest.slug);

  const state = base64url(crypto.randomBytes(32));
  const codeVerifier = base64url(crypto.randomBytes(32));

  await prisma.oAuthState.create({
    data: {
      state,
      clientId: params.clientId,
      provider: manifest.slug,
      redirectUri,
      codeVerifier,
      connectSessionId: params.connectSessionId ?? null,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });

  const url = new URL(manifest.auth.authorizationUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', appClientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  // Scope is optional in OAuth 2.0 (RFC 6749, 3.3) and some providers, RD
  // Station CRM among them, document none. An empty `scope=` is not the same as
  // leaving it out: strict servers reject it as an invalid scope.
  if (manifest.auth.scopes.length > 0) {
    url.searchParams.set('scope', manifest.auth.scopes.join(' '));
  }

  if (manifest.auth.pkce) {
    url.searchParams.set('code_challenge', base64url(crypto.createHash('sha256').update(codeVerifier).digest()));
    url.searchParams.set('code_challenge_method', 'S256');
  }

  return { authorizationUrl: url.toString(), state };
}

/**
 * Which hosted session a state belongs to, without burning it.
 *
 * The callback needs this before it knows whether the flow succeeded: a
 * customer who pressed cancel on the provider must land back on the page that
 * sent them, not on our sign-in screen.
 */
export async function connectSessionIdForState(state: string): Promise<string | null> {
  const record = await prisma.oAuthState.findUnique({
    where: { state },
    select: { connectSessionId: true },
  });

  return record?.connectSessionId ?? null;
}

export interface ConsumedState {
  clientId: string;
  provider: string;
  redirectUri: string;
  codeVerifier: string | null;
  /** The hosted connect session this flow belongs to, if any. */
  connectSessionId: string | null;
}

/**
 * Validates and burns a state value. Single use and time limited, so a leaked
 * callback URL cannot be replayed.
 */
export async function consumeOAuthState(state: string, providerSlug: string): Promise<ConsumedState> {
  const record = await prisma.oAuthState.findUnique({ where: { state } });

  if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
    throw new ProviderError('INVALID_REQUEST', 'This authorization link is invalid or has expired. Please try again.');
  }
  if (record.provider !== providerSlug) {
    throw new ProviderError('INVALID_REQUEST', 'This authorization link does not match the provider that answered.');
  }

  await prisma.oAuthState.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

  return {
    clientId: record.clientId,
    provider: record.provider,
    redirectUri: record.redirectUri,
    codeVerifier: record.codeVerifier,
    connectSessionId: record.connectSessionId,
  };
}

/** Exchanges an authorization code for tokens, driven by the manifest. */
export async function exchangeCodeForTokens(params: {
  providerSlug: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
}): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null }> {
  const manifest = getManifest(params.providerSlug);
  if (manifest.auth.type !== 'OAUTH2') {
    throw new ProviderError('INVALID_REQUEST', `${manifest.name} does not use an OAuth flow.`);
  }

  const { clientId, clientSecret } = resolveOAuthClient(manifest.slug);

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  if (manifest.auth.tokenEndpointAuth === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    form.set('client_id', clientId);
    form.set('client_secret', clientSecret);
  }

  if (manifest.auth.pkce && params.codeVerifier) {
    form.set('code_verifier', params.codeVerifier);
  }

  const response = await fetch(manifest.auth.tokenUrl, { method: 'POST', headers, body: form });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[OAuth] ${manifest.slug} code exchange failed: HTTP ${response.status} :: ${detail.slice(0, 500)}`);
    throw new ProviderError('UPSTREAM_ERROR', `Could not complete the ${manifest.name} connection.`, {
      provider: manifest.slug,
      details: detail,
    });
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
  };
}
