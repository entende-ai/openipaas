import { contaAzulManifest } from '../implementations/contaazul/manifest';
import { omieManifest } from '../implementations/omie/manifest';
import { rdStationCrmManifest } from '../implementations/rdstationcrm/manifest';
import { tinyManifest } from '../implementations/tiny/manifest';
import type { ProviderCategory, ProviderManifest } from './types';

/**
 * Manifests only: plain data, no provider classes.
 *
 * Kept separate from registry.ts so that anything which merely *describes* the
 * catalog (the docs page, the connect UI, the public /providers endpoint) can
 * read it without pulling in BaseProvider and its Node-only dependencies. The
 * docs page is a client component; importing the registry there dragged ioredis
 * into the browser bundle and broke the build.
 */

export const MANIFESTS: Record<string, ProviderManifest> = {
  [contaAzulManifest.slug]: contaAzulManifest,
  [omieManifest.slug]: omieManifest,
  [rdStationCrmManifest.slug]: rdStationCrmManifest,
  [tinyManifest.slug]: tinyManifest,
};

export function normalizeSlug(slug: string): string {
  return (slug ?? '').trim().toUpperCase();
}

export function findManifest(slug: string): ProviderManifest | undefined {
  return MANIFESTS[normalizeSlug(slug)];
}

/** Whether the provider maps any upstream data onto a unified resource. */
export function hasUnifiedResources(manifest: ProviderManifest): boolean {
  return Object.values(manifest.capabilities).some((operations) => (operations?.length ?? 0) > 0);
}

/**
 * How the connect dialog offers a provider.
 *
 * `enabled` alone decides whether it can be connected. The note only describes
 * what a connection gets you: a provider with no unified resources yet is still
 * worth connecting when passthrough reaches its raw API.
 */
export function connectionOffer(manifest: ProviderManifest): { connectable: boolean; note: string | null } {
  if (!manifest.enabled) return { connectable: false, note: 'coming soon' };
  if (!hasUnifiedResources(manifest) && manifest.passthrough) return { connectable: true, note: 'passthrough only' };
  return { connectable: true, note: null };
}

export function listManifests(
  opts: { category?: ProviderCategory; enabledOnly?: boolean } = {}
): ProviderManifest[] {
  return Object.values(MANIFESTS)
    .filter((m) => (opts.category ? m.category === opts.category : true))
    .filter((m) => (opts.enabledOnly ? m.enabled : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}
