import prisma from './prisma';
import { decrypt, encrypt, encryptNullable } from './crypto';
import { getManifest } from './providers/core/registry';
import { ProviderError } from './providers/core/errors';
import type { ProviderContext } from './providers/core/types';

/**
 * Provider-agnostic OAuth2 refresh, driven entirely by the manifest.
 *
 * Adding an OAuth provider needs no change here: the manifest supplies the token
 * URL and whether the client credentials go in an Authorization: Basic header or
 * in the form body.
 */
export async function refreshCredential(
  ctx: ProviderContext
): Promise<{ accessToken: string; refreshToken?: string | null }> {
  const credential = await prisma.oAuthCredential.findUnique({
    where: { id: ctx.credentialId },
    include: { linkedAccount: true },
  });

  if (!credential) {
    throw new ProviderError('CONFIG_ERROR', 'The credential for this account no longer exists.');
  }

  const manifest = getManifest(credential.linkedAccount.provider);

  if (manifest.auth.type !== 'OAUTH2') {
    // API-key providers cannot refresh: a 401 means the key itself is wrong.
    throw new ProviderError('TOKEN_EXPIRED', `The ${manifest.name} credentials were rejected. Please reconnect the account.`, {
      provider: manifest.slug,
    });
  }

  const refreshToken = credential.refreshToken ? decrypt(credential.refreshToken) : null;
  if (!refreshToken) {
    throw new ProviderError('TOKEN_EXPIRED', `The ${manifest.name} session expired. Please reconnect the account.`, {
      provider: manifest.slug,
    });
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

  const response = await fetch(manifest.auth.tokenUrl, { method: 'POST', headers, body: form });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[TokenRefresh] ${manifest.slug} refresh failed: HTTP ${response.status} :: ${detail.slice(0, 500)}`);
    throw new ProviderError('TOKEN_EXPIRED', `Could not renew the ${manifest.name} session. Please reconnect the account.`, {
      provider: manifest.slug,
      details: detail,
    });
  }

  const data = await response.json();
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;

  await prisma.oAuthCredential.update({
    where: { id: credential.id },
    data: {
      accessToken: encrypt(data.access_token),
      // Providers that rotate refresh tokens send a new one; others omit it.
      refreshToken: data.refresh_token ? encrypt(data.refresh_token) : credential.refreshToken,
      expiresAt,
    },
  });

  console.log(`[TokenRefresh] ${manifest.slug} credential ${credential.id} renewed.`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken };
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

/** Stores a freshly issued credential from an authorization-code exchange. */
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
    return prisma.oAuthCredential.update({ where: { id: existing.id }, data });
  }
  return prisma.oAuthCredential.create({ data: { ...data, linkedAccountId: params.linkedAccountId } });
}
