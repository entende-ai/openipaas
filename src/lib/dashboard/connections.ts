import type { ProviderManifest } from '@/lib/providers/core/types';

/**
 * What the console says about a connected account.
 *
 * The old screen printed a hardcoded "Connected" badge next to every row,
 * which was true even for an account whose token had expired hours earlier.
 * These are pure functions so the answer can be tested without a database.
 */

export type ConnectionState = 'active' | 'expiring' | 'expired' | 'stale' | 'missing';

export interface ConnectionHealth {
  state: ConnectionState;
  label: string;
  /** One line under the badge. Empty when there is nothing useful to add. */
  detail: string;
  /** Whether the operator has to do something about it. */
  needsAttention: boolean;
}

/** Below this, a token is close enough to expiry to be worth flagging. */
export const EXPIRING_SOON_MS = 10 * 60 * 1000;

export function connectionHealth(input: {
  hasCredential: boolean;
  expiresAt?: Date | null;
  hasRefreshToken?: boolean;
  now?: Date;
}): ConnectionHealth {
  const now = input.now ?? new Date();

  if (!input.hasCredential) {
    return {
      state: 'missing',
      label: 'Not connected',
      detail: 'No stored credential. Connect the account again.',
      needsAttention: true,
    };
  }

  // A provider that never says when its token dies (an API key, say) is not a
  // problem, it just cannot be reported on.
  if (!input.expiresAt) {
    return { state: 'active', label: 'Connected', detail: 'No expiry reported by the provider.', needsAttention: false };
  }

  const remainingMs = input.expiresAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return input.hasRefreshToken
      ? {
          state: 'stale',
          label: 'Renewing',
          detail: `Token expired ${formatDuration(-remainingMs)} ago. The next request renews it.`,
          needsAttention: false,
        }
      : {
          state: 'expired',
          label: 'Expired',
          detail: 'The token expired and there is no refresh token. Reconnect the account.',
          needsAttention: true,
        };
  }

  if (remainingMs <= EXPIRING_SOON_MS) {
    return {
      state: 'expiring',
      label: 'Expiring',
      detail: `Token expires in ${formatDuration(remainingMs)}.`,
      needsAttention: false,
    };
  }

  return { state: 'active', label: 'Connected', detail: `Token valid for ${formatDuration(remainingMs)}.`, needsAttention: false };
}

/** Rounded on purpose: "in 2 hours" reads better than "in 1h 58m 12s". */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return 'less than a minute';

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Account tokens are shown on a screen someone may be sharing. Enough
 * characters to recognise which one it is, not enough to use it.
 */
export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 12) return `${token.slice(0, 2)}${'•'.repeat(Math.max(token.length - 2, 0))}`;
  return `${token.slice(0, 8)}${'•'.repeat(8)}${token.slice(-4)}`;
}

/** What a connection can actually do, for the empty state and the playground. */
export function connectionAbilities(manifest: ProviderManifest): { unified: string[]; passthrough: boolean } {
  const unified = Object.entries(manifest.capabilities)
    .filter(([, operations]) => (operations?.length ?? 0) > 0)
    .map(([resource]) => resource)
    .sort();

  return { unified, passthrough: manifest.passthrough };
}
