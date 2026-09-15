import type { OAuthCredential, Prisma } from '@prisma/client';
import prisma from './prisma';
import { decrypt, decryptNullable, encrypt, encryptNullable } from './crypto';
import { getManifest } from './providers/core/registry';
import { ProviderError } from './providers/core/errors';
import type { ProviderContext, ProviderManifest } from './providers/core/types';

/**
 * Provider-agnostic OAuth2 refresh, driven entirely by the manifest.
 *
 * Adding an OAuth provider needs no change here: the manifest supplies the token
 * URL and whether the client credentials go in an Authorization: Basic header or
 * in the form body.
 *
 * Refreshes are serialized per credential, because some providers (RD Station
 * CRM among them) rotate the refresh token: every use returns a new one and
 * invalidates the old. When a token expires, every request in flight gets a 401
 * at the same moment and each tries to refresh. Unserialized, the first renews
 * and the rest present a refresh token that is already dead, so a healthy
 * account answers "please reconnect". Providers that detect refresh token reuse
 * go further and revoke the whole token family, which disconnects the account
 * for real.
 *
 * Two layers, because they fail differently:
 *   - in process, concurrent callers share one promise, so a burst costs one
 *     token request and no lock contention;
 *   - across instances, a Postgres advisory lock serializes the rest, and the
 *     holder re-reads the row before refreshing, so a waiter that finds the
 *     token already renewed uses it instead of spending the refresh token again.
 *
 * The lock lives in Postgres rather than Redis because Postgres is where the
 * token is stored and is always present. Redis is optional and falls back to
 * memory when absent, which would silently drop the cross-instance guarantee on
 * exactly the deployments that run several instances without it.
 */

export interface RenewedCredential {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}

/**
 * Upper bound on the token endpoint call. It runs while the lock is held, so a
 * hung provider must not be able to hold it indefinitely.
 */
export const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

/**
 * A waiter spends at most one token request queued behind the holder, then at
 * most one of its own. Prisma's default of 5s would abort the waiter while the
 * holder is still legitimately working, and aborting a holder after the provider
 * has rotated the token but before the commit loses that token for good.
 */
export const REFRESH_TRANSACTION_TIMEOUT_MS = 2 * TOKEN_REQUEST_TIMEOUT_MS + 5_000;

/**
 * First key of the two-key advisory lock. Postgres keeps the two-key and
 * single-key forms in separate key spaces, so this cannot collide with the
 * single-key lock `prisma migrate` takes.
 */
export const REFRESH_LOCK_NAMESPACE = 72_070_001;

/**
 * Serializes every writer of one credential: a refresh, and a reconnect that
 * replaces its tokens. Released when the transaction ends, commit or rollback,
 * so it cannot leak.
 */
async function lockCredential(tx: Prisma.TransactionClient, credentialId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_LOCK_NAMESPACE}::int4, hashtext(${credentialId}::text))`;
}

const inFlight = new Map<string, Promise<RenewedCredential>>();

/**
 * Renews the credential behind `ctx`, where `ctx.accessToken` is the token the
 * caller found expired. Safe to call concurrently from any number of requests
 * and instances: the refresh token is spent once.
 */
export function refreshCredential(ctx: ProviderContext): Promise<RenewedCredential> {
  const pending = inFlight.get(ctx.credentialId);
  if (pending) return pending;

  const run = refreshWithLock(ctx).finally(() => inFlight.delete(ctx.credentialId));
  inFlight.set(ctx.credentialId, run);
  return run;
}

/**
 * The cross-instance half on its own. Exported for the integration test, which
 * has to bypass the in-process layer to prove the lock does its job.
 */
export async function refreshWithLock(ctx: ProviderContext): Promise<RenewedCredential> {
  return prisma.$transaction(
    async (tx) => {
      await lockCredential(tx, ctx.credentialId);

      const credential = await tx.oAuthCredential.findUnique({
        where: { id: ctx.credentialId },
        include: { linkedAccount: true },
      });

      if (!credential) {
        throw new ProviderError('CONFIG_ERROR', 'The credential for this account no longer exists.');
      }

      // Whoever held the lock before us may have renewed already. Then the token
      // the caller found expired is no longer the stored one: the stored one is
      // the answer, and the refresh token, possibly rotated, stays unspent.
      const stored = decrypt(credential.accessToken);
      if (stored !== ctx.accessToken) {
        return {
          accessToken: stored,
          refreshToken: decryptNullable(credential.refreshToken),
          expiresAt: credential.expiresAt,
        };
      }

      const manifest = getManifest(credential.linkedAccount.provider);

      if (manifest.auth.type !== 'OAUTH2') {
        // API-key providers cannot refresh: a 401 means the key itself is wrong.
        throw new ProviderError('TOKEN_EXPIRED', `The ${manifest.name} credentials were rejected. Please reconnect the account.`, {
          provider: manifest.slug,
        });
      }

      const refreshToken = decryptNullable(credential.refreshToken);
      if (!refreshToken) {
        throw new ProviderError('TOKEN_EXPIRED', `The ${manifest.name} session expired. Please reconnect the account.`, {
          provider: manifest.slug,
        });
      }

      const data = await requestNewTokens(manifest, credential, refreshToken);
      const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;

      try {
        await tx.oAuthCredential.update({
          where: { id: credential.id },
          data: {
            accessToken: encrypt(data.access_token),
            // Providers that rotate refresh tokens send a new one; others omit it.
            refreshToken: data.refresh_token ? encrypt(data.refresh_token) : credential.refreshToken,
            expiresAt,
          },
        });
      } catch (err) {
        // Past the point of no return: a rotating provider has already
        // invalidated the old refresh token, and the new one exists only here.
        console.error(
          `[TokenRefresh] ${manifest.slug} credential ${credential.id} was renewed upstream but could not be saved. ` +
            'If this provider rotates refresh tokens, the account will need to be reconnected.',
          (err as Error).message
        );
        throw err;
      }

      console.log(`[TokenRefresh] ${manifest.slug} credential ${credential.id} renewed.`);
      return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken, expiresAt };
    },
    { timeout: REFRESH_TRANSACTION_TIMEOUT_MS }
  );
}

async function requestNewTokens(
  manifest: ProviderManifest,
  credential: OAuthCredential,
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  if (manifest.auth.type !== 'OAUTH2') {
    throw new ProviderError('CONFIG_ERROR', `${manifest.name} does not use an OAuth flow.`);
  }

  const { clientId, clientSecret } = resolveOAuthClient(manifest.slug, credential);

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

  if (manifest.auth.tokenEndpointAuth === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    form.set('client_id', clientId);
    form.set('client_secret', clientSecret);
  }

  const response = await fetch(manifest.auth.tokenUrl, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[TokenRefresh] ${manifest.slug} refresh failed: HTTP ${response.status} :: ${detail.slice(0, 500)}`);
    throw new ProviderError('TOKEN_EXPIRED', `Could not renew the ${manifest.name} session. Please reconnect the account.`, {
      provider: manifest.slug,
      details: detail,
    });
  }

  return response.json();
}

/**
 * OAuth app credentials come from the connected account when the customer
 * brought their own app, otherwise from the server environment.
 */
export function resolveOAuthClient(
  slug: string,
  credential?: { erpClientId: string | null; erpClientSecret: string | null } | null
): { clientId: string; clientSecret: string } {
  const fromCredential = {
    clientId: credential?.erpClientId ? decrypt(credential.erpClientId) : '',
    clientSecret: credential?.erpClientSecret ? decrypt(credential.erpClientSecret) : '',
  };

  if (fromCredential.clientId && fromCredential.clientSecret) return fromCredential;

  const clientId = (process.env[`${slug}_CLIENT_ID`] || '').trim();
  const clientSecret = (process.env[`${slug}_CLIENT_SECRET`] || '').trim();

  if (!clientId || !clientSecret) {
    throw new ProviderError('CONFIG_ERROR', `OAuth app credentials for ${slug} are not configured on the server.`, {
      provider: slug,
    });
  }

  return { clientId, clientSecret };
}

/**
 * Stores a freshly issued credential from an authorization-code exchange.
 *
 * Replacing an existing credential takes the same lock as a refresh. Otherwise
 * a refresh already in flight when the user reconnects finishes afterwards and
 * writes back tokens from the old grant over the new ones, which a provider
 * that revoked the old grant on reconnect then rejects. With the lock, the
 * reconnect waits and writes last; a refresh that starts after it re-reads the
 * row and finds the new token already there.
 */
export async function persistNewCredential(params: {
  linkedAccountId: string;
  authType: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  instanceUrl?: string | null;
  externalTenantId?: string | null;
}) {
  const existing = await prisma.oAuthCredential.findFirst({
    where: { linkedAccountId: params.linkedAccountId },
    orderBy: { createdAt: 'desc' },
  });

  const data = {
    accessToken: encrypt(params.accessToken),
    refreshToken: encryptNullable(params.refreshToken),
    expiresAt: params.expiresAt ?? null,
    authType: params.authType,
    instanceUrl: params.instanceUrl ?? null,
    externalTenantId: params.externalTenantId ?? null,
  };

  if (existing) {
    return prisma.$transaction(
      async (tx) => {
        await lockCredential(tx, existing.id);
        return tx.oAuthCredential.update({ where: { id: existing.id }, data });
      },
      { timeout: REFRESH_TRANSACTION_TIMEOUT_MS }
    );
  }
  // Nothing to race with: no refresh can be running on a credential that does
  // not exist yet.
  return prisma.oAuthCredential.create({ data: { ...data, linkedAccountId: params.linkedAccountId } });
}
