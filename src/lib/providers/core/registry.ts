import { ProviderError } from './errors';
import type { ProviderDeps } from './BaseProvider';
import type { ProviderCategory, ProviderManifest, UnifiedProvider } from './types';

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
 * The one place a new integration is wired in. Everything else — routes, docs,
 * the connect UI, the public catalog — reads from here, so adding a provider is
 * a folder plus a line.
 */
export const PROVIDERS: Record<string, ProviderEntry> = {
  [contaAzulManifest.slug]: { manifest: contaAzulManifest, create: (deps) => new ContaAzulProvider(deps) },
  [omieManifest.slug]: { manifest: omieManifest, create: (deps) => new OmieProvider(deps) },
  [tinyManifest.slug]: { manifest: tinyManifest, create: (deps) => new TinyProvider(deps) },
};

function normalize(slug: string): string {
  return (slug ?? '').trim().toUpperCase();
}

export function isKnownProvider(slug: string): boolean {
  return normalize(slug) in PROVIDERS;
}

export function getEntry(slug: string): ProviderEntry {
  const entry = PROVIDERS[normalize(slug)];
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

export function listManifests(opts: { category?: ProviderCategory; enabledOnly?: boolean } = {}): ProviderManifest[] {
  return Object.values(PROVIDERS)
    .map((entry) => entry.manifest)
    .filter((m) => (opts.category ? m.category === opts.category : true))
    .filter((m) => (opts.enabledOnly ? m.enabled : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}
