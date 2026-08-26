import { ProviderError } from './errors';
import { MANIFESTS, normalizeSlug } from './manifests';
import type { ProviderDeps } from './BaseProvider';
import type { ProviderManifest, UnifiedProvider } from './types';

import { contaAzulManifest } from '../implementations/contaazul/manifest';
import { ContaAzulProvider } from '../implementations/contaazul/provider';
import { omieManifest } from '../implementations/omie/manifest';
import { OmieProvider } from '../implementations/omie/provider';
import { tinyManifest } from '../implementations/tiny/manifest';
import { TinyProvider } from '../implementations/tiny/provider';

export interface ProviderEntry {
  manifest: ProviderManifest;
  create: (deps: ProviderDeps) => UnifiedProvider;
}

/**
 * The one place a new integration is wired in.
 *
 * Server-side only in practice: constructing a provider pulls in BaseProvider
 * and its Node-only dependencies. Anything that merely *describes* the catalog
 * (the docs page, the connect UI, the public /providers endpoint) must import
 * `manifests.ts` instead, or the entire provider implementation ends up in the
 * browser bundle.
 */
export const PROVIDERS: Record<string, ProviderEntry> = {
  [contaAzulManifest.slug]: { manifest: contaAzulManifest, create: (deps) => new ContaAzulProvider(deps) },
  [omieManifest.slug]: { manifest: omieManifest, create: (deps) => new OmieProvider(deps) },
  [tinyManifest.slug]: { manifest: tinyManifest, create: (deps) => new TinyProvider(deps) },
};

export function isKnownProvider(slug: string): boolean {
  return normalizeSlug(slug) in PROVIDERS;
}

export function getEntry(slug: string): ProviderEntry {
  const entry = PROVIDERS[normalizeSlug(slug)];
  if (!entry) {
    throw new ProviderError('INVALID_REQUEST', `Unknown provider "${slug}".`, { status: 400 });
  }
  return entry;
}

export function getManifest(slug: string): ProviderManifest {
  return getEntry(slug).manifest;
}

export function createProvider(slug: string, deps: ProviderDeps = {}): UnifiedProvider {
  return getEntry(slug).create(deps);
}

/**
 * Guards against the registry and the manifest list drifting apart, which would
 * make a provider visible in the catalog but unusable through the API.
 */
export function assertRegistryMatchesManifests(): void {
  const registrySlugs = Object.keys(PROVIDERS).sort().join(',');
  const manifestSlugs = Object.keys(MANIFESTS).sort().join(',');

  if (registrySlugs !== manifestSlugs) {
    throw new Error(
      `Provider registry and manifest list disagree. Registry: [${registrySlugs}] Manifests: [${manifestSlugs}]`
    );
  }
}

export { listManifests, findManifest } from './manifests';
