import type { LinkedAccount, OAuthCredential } from '@prisma/client';

import { connectionHealth, type ConnectionState } from './dashboard/connections';
import { pickActiveCredential } from './credentials';
import { findManifest } from './providers/core/manifests';
import { isKnownProvider } from './providers/core/registry';
import { clientScopePrefixes } from './mcp/connections';
import type { Operation, ResourceName } from './providers/core/types';

/**
 * What a client's connections look like from outside.
 *
 * `GET /providers` says what this platform supports; this says what one company
 * has. An integrator needs the second to draw a screen, to know which service
 * name to send, and to recover from an ambiguity without a person opening the
 * dashboard.
 *
 * Pure, and built from the same helpers the dashboard uses, so the answer the
 * API gives and the answer the console shows cannot drift apart.
 */

/** `unavailable` is a provider that left the registry, so nothing can call it. */
export type ConnectionStatus = ConnectionState | 'unavailable';

export interface ConnectionView {
  id: string;
  label: string;
  /** The service name, which is what `X-Provider` takes. */
  service: string;
  serviceName: string;
  status: ConnectionStatus;
  statusDetail: string;
  /** True while a person has to do something before this connection works. */
  needsAttention: boolean;
  /**
   * Addresses this exact connection through `X-Account-Token`, which is only
   * needed when the client has two accounts on one service. It is an address,
   * not a credential: alone it authenticates nothing.
   */
  connectionToken: string;
  /** Tool prefix an agent sees on the client-scoped MCP server, or null. */
  agentToolPrefix: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  capabilities: Partial<Record<ResourceName, readonly Operation[]>>;
  /** Resources whose list accepts updatedAfter on this service. */
  incremental: readonly ResourceName[];
  passthrough: boolean;
}

type Account = LinkedAccount & { credentials: OAuthCredential[] };

export function describeConnections(params: {
  accounts: Account[];
  /** Last request that reached each connection, by connection id. */
  lastUsedAt?: Map<string, Date>;
  now?: Date;
}): ConnectionView[] {
  const usable = (account: Account) =>
    isKnownProvider(account.provider) && Boolean(pickActiveCredential(account.credentials));

  // Computed over the whole set, because a prefix depends on the other
  // connections of the same client: two accounts on one service are told apart
  // by a fragment of their id.
  const prefixes = clientScopePrefixes(
    params.accounts.map((account) => ({ id: account.id, providerSlug: account.provider, usable: usable(account) }))
  );

  return params.accounts.map((account) => {
    const manifest = findManifest(account.provider);
    const credential = pickActiveCredential(account.credentials);
    const lastUsed = params.lastUsedAt?.get(account.id) ?? null;

    const health = manifest
      ? connectionHealth({
          hasCredential: Boolean(credential),
          expiresAt: credential?.expiresAt ?? null,
          hasRefreshToken: Boolean(credential?.refreshToken),
          now: params.now,
        })
      : {
          state: 'missing' as ConnectionState,
          label: 'Unavailable',
          detail: `${account.provider} is not in this deployment's provider registry, so nothing can call it.`,
          needsAttention: true,
        };

    return {
      id: account.id,
      // A connection made before labels existed has none; the service reads
      // better there than an empty string.
      label: account.label?.trim() || manifest?.name || account.provider,
      service: account.provider,
      serviceName: manifest?.name ?? account.provider,
      status: manifest ? health.state : 'unavailable',
      statusDetail: health.detail,
      needsAttention: health.needsAttention,
      connectionToken: account.accountToken,
      agentToolPrefix: prefixes.get(account.id) ?? null,
      connectedAt: account.createdAt.toISOString(),
      lastUsedAt: lastUsed ? lastUsed.toISOString() : null,
      capabilities: manifest?.capabilities ?? {},
      incremental: manifest?.incremental ?? [],
      passthrough: manifest?.passthrough ?? false,
    };
  });
}
