import { describe, it, expect } from 'vitest';
import { connectionOffer, hasUnifiedResources, listManifests } from '@/lib/providers/core/manifests';
import type { ProviderManifest } from '@/lib/providers/core/types';
import { tinyManifest } from '@/lib/providers/implementations/tiny/manifest';

const manifest = (overrides: Partial<ProviderManifest>): ProviderManifest => ({ ...tinyManifest, ...overrides });

describe('connectionOffer', () => {
  it('does not offer a provider that is not enabled, whatever it can do', () => {
    expect(connectionOffer(manifest({ enabled: false, passthrough: true, capabilities: {} }))).toEqual({
      connectable: false,
      note: 'coming soon',
    });
    expect(
      connectionOffer(manifest({ enabled: false, passthrough: false, capabilities: { customers: ['list'] } }))
    ).toEqual({ connectable: false, note: 'coming soon' });
  });

  // The dialog used to label every disabled provider "(passthrough only)" and
  // refuse it, so a passthrough-only provider could never be connected.
  it('offers an enabled passthrough-only provider and says so', () => {
    expect(connectionOffer(manifest({ enabled: true, passthrough: true, capabilities: {} }))).toEqual({
      connectable: true,
      note: 'passthrough only',
    });
  });

  it('adds no note once a unified resource exists', () => {
    expect(
      connectionOffer(manifest({ enabled: true, passthrough: true, capabilities: { customers: ['list'] } }))
    ).toEqual({ connectable: true, note: null });
  });

  it('treats a resource with no operations as no resource', () => {
    expect(hasUnifiedResources(manifest({ capabilities: { customers: [] } }))).toBe(false);
    expect(connectionOffer(manifest({ enabled: true, passthrough: true, capabilities: { customers: [] } })).note).toBe(
      'passthrough only'
    );
  });
});

describe('enabled providers', () => {
  // Connecting an account that exposes neither unified resources nor the raw
  // API would leave the developer with a token that does nothing.
  it.each(listManifests({ enabledOnly: true }).map((m) => [m.slug, m] as const))(
    '%s is worth connecting',
    (_slug, m) => {
      expect(hasUnifiedResources(m) || m.passthrough).toBe(true);
    }
  );
});
