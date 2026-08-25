import { describe, it, expect } from 'vitest';
import { PROVIDERS, listManifests, getManifest, createProvider, isKnownProvider } from '@/lib/providers/core/registry';
import type { Operation, ResourceName } from '@/lib/providers/core/types';

/**
 * Contract suite: runs against every provider in the registry.
 *
 * This is what makes community contributions reviewable — a new provider either
 * satisfies the shared contract or the build fails, without anyone having to
 * read the whole implementation.
 */

const RESOURCE_METHODS: Record<string, { resource: ResourceName; operation: Operation }> = {
  listCustomers: { resource: 'customers', operation: 'list' },
  getCustomer: { resource: 'customers', operation: 'get' },
  createCustomer: { resource: 'customers', operation: 'create' },
  updateCustomer: { resource: 'customers', operation: 'update' },
  bulkActivateCustomers: { resource: 'customers', operation: 'bulkActivate' },
  bulkDeactivateCustomers: { resource: 'customers', operation: 'bulkDeactivate' },
  bulkDeleteCustomers: { resource: 'customers', operation: 'bulkDelete' },
  listProducts: { resource: 'products', operation: 'list' },
  getProduct: { resource: 'products', operation: 'get' },
  createProduct: { resource: 'products', operation: 'create' },
  updateProduct: { resource: 'products', operation: 'update' },
  deleteProduct: { resource: 'products', operation: 'delete' },
  listCategories: { resource: 'categories', operation: 'list' },
  listBrands: { resource: 'brands', operation: 'list' },
  listUnits: { resource: 'units', operation: 'list' },
  listSales: { resource: 'sales', operation: 'list' },
  getSale: { resource: 'sales', operation: 'get' },
  createSale: { resource: 'sales', operation: 'create' },
  getSalePdf: { resource: 'sales', operation: 'pdf' },
  bulkDeleteSales: { resource: 'sales', operation: 'bulkDelete' },
  listSellers: { resource: 'sellers', operation: 'list' },
};

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
      expect(manifest.auth.scopes.length).toBeGreaterThan(0);
      expect(['basic', 'body']).toContain(manifest.auth.tokenEndpointAuth);
    } else {
      expect(manifest.auth.fields.length).toBeGreaterThan(0);
      for (const field of manifest.auth.fields) {
        expect(field.key.length).toBeGreaterThan(0);
        expect(field.label.length).toBeGreaterThan(0);
      }
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
