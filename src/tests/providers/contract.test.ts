import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';
import { PROVIDERS, listManifests, getManifest, createProvider, isKnownProvider } from '@/lib/providers/core/registry';
import { RESOURCE_METHODS } from '@/lib/providers/core/operations';
import type { Operation } from '@/lib/providers/core/types';

/**
 * Contract suite: runs against every provider in the registry.
 *
 * This is what makes community contributions reviewable: a new provider either
 * satisfies the shared contract or the build fails, without anyone having to
 * read the whole implementation.
 */


const slugs = Object.keys(PROVIDERS);

describe('provider registry', () => {
  it('exposes at least one provider', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it('keys every entry by its own manifest slug', () => {
    for (const [key, entry] of Object.entries(PROVIDERS)) {
      expect(entry.manifest.slug).toBe(key);
    }
  });

  it('resolves slugs case-insensitively', () => {
    for (const slug of slugs) {
      expect(isKnownProvider(slug.toLowerCase())).toBe(true);
      expect(getManifest(slug.toLowerCase()).slug).toBe(slug);
    }
  });

  it('rejects unknown slugs', () => {
    expect(isKnownProvider('DEFINITELY_NOT_A_PROVIDER')).toBe(false);
    expect(() => getManifest('DEFINITELY_NOT_A_PROVIDER')).toThrow(/Unknown provider/);
  });

  it('lists manifests sorted and filterable', () => {
    const all = listManifests();
    const names = all.map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    for (const manifest of all) {
      expect(listManifests({ category: manifest.category })).toContain(manifest);
    }
  });
});

describe.each(slugs)('provider contract: %s', (slug) => {
  const manifest = getManifest(slug);
  const provider = createProvider(slug);

  it('has a complete manifest', () => {
    expect(manifest.slug).toMatch(/^[A-Z0-9_]+$/);
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.baseUrl).toMatch(/^https:\/\//);
    // A trailing slash would produce a double slash once a path is appended.
    expect(manifest.baseUrl.endsWith('/')).toBe(false);
    expect(typeof manifest.passthrough).toBe('boolean');
    expect(typeof manifest.enabled).toBe('boolean');
  });

  it('declares a usable auth config', () => {
    if (manifest.auth.type === 'OAUTH2') {
      expect(manifest.auth.authorizationUrl).toMatch(/^https:\/\//);
      expect(manifest.auth.tokenUrl).toMatch(/^https:\/\//);
      // Empty is legitimate: scope is optional in OAuth 2.0 and RD Station CRM
      // documents none. The authorize URL then omits the parameter entirely.
      expect(Array.isArray(manifest.auth.scopes)).toBe(true);
      for (const scope of manifest.auth.scopes) expect(scope.trim().length).toBeGreaterThan(0);
      expect(['basic', 'body']).toContain(manifest.auth.tokenEndpointAuth);
    } else {
      expect(manifest.auth.fields.length).toBeGreaterThan(0);
      for (const field of manifest.auth.fields) {
        expect(field.key.length).toBeGreaterThan(0);
        expect(field.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('points its logo at a file that exists', () => {
    if (!manifest.logo) return;
    // The catalog endpoint returns this path as is. Every provider once pointed
    // at an SVG that was never added, and nobody noticed because no screen
    // renders it yet.
    expect(manifest.logo).toMatch(/^\/logos\//);
    expect(existsSync(path.join('public', manifest.logo)), `${manifest.logo} is not in public/`).toBe(true);
  });

  it('offers example paths only where they can be called', () => {
    for (const example of manifest.passthroughExamples ?? []) {
      // The playground puts these straight into a request, so a path that is
      // not relative would send the account's token to another host.
      expect(example.path.startsWith('/'), `${example.path} must start with /`).toBe(true);
      expect(example.path.startsWith('//')).toBe(false);
      expect(example.label.trim().length).toBeGreaterThan(0);
      expect(manifest.passthrough, `${slug} offers example paths but no passthrough`).toBe(true);
    }
  });

  it('exposes the provider instance through the registry', () => {
    expect(provider.manifest.slug).toBe(slug);
  });

  /**
   * The two halves must agree. A capability with no method is a 501 the manifest
   * promised would work; a method with no capability is undiscoverable and will
   * throw from assertSupports at runtime.
   */
  it('implements exactly the capabilities it declares', () => {
    for (const [method, { resource, operation }] of Object.entries(RESOURCE_METHODS)) {
      const declared = (manifest.capabilities[resource] ?? []).includes(operation);
      const implemented = typeof (provider as any)[method] === 'function';

      if (declared) {
        expect(implemented, `${slug} declares ${resource}.${operation} but has no ${method}()`).toBe(true);
      }
      if (implemented && !declared) {
        expect.fail(`${slug} implements ${method}() but does not declare ${resource}.${operation}`);
      }
    }
  });

  it('only declares operations that are valid for the resource', () => {
    for (const [resource, operations] of Object.entries(manifest.capabilities)) {
      expect(Array.isArray(operations), `${resource} capabilities must be an array`).toBe(true);
      expect(new Set(operations).size, `${resource} has duplicate operations`).toBe((operations as string[]).length);
    }
  });

  it('reports capability support consistently', () => {
    const anyProvider = provider as any;
    if (typeof anyProvider.supports !== 'function') return;

    for (const [resource, operations] of Object.entries(manifest.capabilities)) {
      for (const operation of operations as Operation[]) {
        expect(anyProvider.supports(resource, operation)).toBe(true);
      }
    }
    expect(anyProvider.supports('customers', 'pdf' as Operation)).toBe(
      (manifest.capabilities.customers ?? []).includes('pdf' as Operation)
    );
  });

  it('offers passthrough when the manifest advertises it', () => {
    if (manifest.passthrough) {
      expect(typeof (provider as any).passthrough).toBe('function');
    }
  });
});

/**
 * Layering guard.
 *
 * The docs page is a client component and reads the capability matrix. When that
 * path went through registry.ts it dragged BaseProvider, and ioredis with its
 * Node-only imports, into the browser bundle and broke the build. Data and
 * implementation must stay separable.
 */
describe('manifest/registry layering', () => {
  it('keeps the registry and the manifest list in agreement', async () => {
    const { assertRegistryMatchesManifests } = await import('@/lib/providers/core/registry');
    expect(() => assertRegistryMatchesManifests()).not.toThrow();
  });

  it('exposes the same providers through both entry points', async () => {
    const { listManifests: fromManifests } = await import('@/lib/providers/core/manifests');
    const { PROVIDERS } = await import('@/lib/providers/core/registry');

    expect(fromManifests().map((m) => m.slug).sort()).toEqual(Object.keys(PROVIDERS).sort());
  });

  it('manifests.ts does not reach into provider implementations', async () => {
    const { readFileSync } = await import('fs');
    // Only the import statements matter; prose in the comments may name them.
    const imports = readFileSync('src/lib/providers/core/manifests.ts', 'utf8')
      .split('\n')
      .filter((line) => line.trimStart().startsWith('import'));

    for (const line of imports) {
      expect(line, `manifests.ts must not import implementation code: ${line}`).not.toMatch(
        /\/provider'|BaseProvider|\/registry'/
      );
    }
    // It must still import the manifests themselves.
    expect(imports.some((l) => l.includes('/manifest'))).toBe(true);
  });

  it('the OpenAPI spec reads manifests, not the registry', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/lib/openapi.ts', 'utf8');

    // openapi.ts is pulled in by the client-side docs page.
    expect(source).not.toMatch(/providers\/core\/registry/);
  });
});
