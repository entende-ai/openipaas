import type { OAuthCredential } from '@prisma/client';
import { decrypt, decryptNullable, encrypt, encryptNullable } from './crypto';
import type { ProviderContext } from './providers/core/types';

/**
 * Translates a stored credential row into the runtime context a provider needs,
 * decrypting on the way out. Everything that reads credentials goes through
 * here, so there is exactly one place that touches ciphertext.
 */
export function toProviderContext(credential: OAuthCredential, provider: string): ProviderContext {
  return {
    credentialId: credential.id,
    provider,
    accessToken: decrypt(credential.accessToken),
    refreshToken: decryptNullable(credential.refreshToken),
    instanceUrl: credential.instanceUrl,
    externalTenantId: credential.externalTenantId,
    secrets: readSecrets(credential.secrets),
  };
}

/** The provider-specific bag (appKey, appSecret, ...) is stored as encrypted JSON. */
export function readSecrets(encrypted: string | null | undefined): Record<string, string> {
  if (!encrypted) return {};
  try {
    const parsed = JSON.parse(decrypt(encrypted));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('[credentials] could not read the secrets bag:', (err as Error).message);
    return {};
  }
}

export function writeSecrets(secrets: Record<string, string> | null | undefined): string | null {
  if (!secrets || Object.keys(secrets).length === 0) return null;
  return encrypt(JSON.stringify(secrets));
}

/** Shapes an incoming credential for storage, encrypting every sensitive field. */
export function toStoredCredential(input: {
  accessToken: string;
  refreshToken?: string | null;
  erpClientId?: string | null;
  erpClientSecret?: string | null;
  secrets?: Record<string, string> | null;
}) {
  return {
    accessToken: encrypt(input.accessToken),
    refreshToken: encryptNullable(input.refreshToken),
    erpClientId: encryptNullable(input.erpClientId),
    erpClientSecret: encryptNullable(input.erpClientSecret),
    secrets: writeSecrets(input.secrets),
  };
}

/**
 * Picks the credential a request should use. Ordering matters: taking
 * `credentials[0]` from an unordered relation returns an arbitrary row once an
 * account has been reconnected.
 */
export function pickActiveCredential<T extends { createdAt: Date }>(credentials: T[]): T | null {
  if (credentials.length === 0) return null;
  return [...credentials].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}
