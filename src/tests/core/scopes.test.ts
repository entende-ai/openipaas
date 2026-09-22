import { describe, it, expect } from 'vitest';
import {
  actionForMethod,
  allows,
  describeScopes,
  FULL_ACCESS,
  parseScopes,
  READ_ONLY,
  resourceForPath,
  SCOPE_RESOURCES,
} from '@/lib/scopes';

/**
 * What a key is allowed to do.
 *
 * Two properties carry the whole feature: a scope never allows more than it
 * says, and a key issued before scopes existed keeps working. Everything else
 * is spelling.
 */

describe('reading a scope', () => {
  it('keeps only scopes it understands', () => {
    expect(parseScopes(['read:contacts', 'delete:contacts', 'read:nonsense', 'WRITE:*'])).toEqual([
      'read:contacts',
      'write:*',
    ]);
  });

  it('answers nothing for anything that is not a list', () => {
    expect(parseScopes(undefined)).toEqual([]);
    expect(parseScopes('read:*')).toEqual([]);
  });
});

describe('what a path and a method ask for', () => {
  it('names the resource the URL names', () => {
    expect(resourceForPath('/api/unified/v1/contacts')).toBe('contacts');
    expect(resourceForPath('/api/unified/v1/contacts/abc/')).toBe('contacts');
    expect(resourceForPath('/api/unified/v1/passthrough/deals/123')).toBe('passthrough');
    expect(resourceForPath('/api/unified/v1/connections')).toBe('connections');
  });

  // A nested path means the same resource an agent tool means, or a scope
  // would allow one and refuse the other for the same data.
  it('treats a nested resource as itself, not as its parent', () => {
    expect(resourceForPath('/api/unified/v1/products/categories')).toBe('categories');
    expect(resourceForPath('/api/unified/v1/products/brands')).toBe('brands');
    expect(resourceForPath('/api/unified/v1/sales/sellers')).toBe('sellers');
    expect(resourceForPath('/api/unified/v1/sales/abc/pdf')).toBe('sales');
  });

  it('has no answer for a path outside the resources', () => {
    expect(resourceForPath('/api/mcp')).toBeNull();
    expect(resourceForPath('/api/unified/v1/')).toBeNull();
  });

  // Bulk endpoints are POSTs that delete. The method is what tells the truth.
  it('calls every method that changes something a write', () => {
    expect(actionForMethod('GET')).toBe('read');
    expect(actionForMethod('post')).toBe('write');
    expect(actionForMethod('DELETE')).toBe('write');
  });
});

describe('what a scope allows', () => {
  it('lets a read-only key read and nothing else', () => {
    expect(allows(READ_ONLY, 'read', 'contacts')).toBe(true);
    expect(allows(READ_ONLY, 'write', 'contacts')).toBe(false);
  });

  it('keeps one resource from standing for another', () => {
    const scopes = ['read:contacts', 'write:contacts'];

    expect(allows(scopes, 'read', 'contacts')).toBe(true);
    expect(allows(scopes, 'read', 'deals')).toBe(false);
    expect(allows(scopes, 'write', 'passthrough')).toBe(false);
  });

  // Passthrough reaches anything the provider has, so a key scoped to one
  // resource must not get at the rest through the raw API.
  it('does not let a resource scope imply passthrough', () => {
    expect(allows(['read:*'], 'read', 'passthrough')).toBe(true);
    expect(allows(['read:contacts'], 'read', 'passthrough')).toBe(false);
  });

  it('refuses a path it could not name', () => {
    expect(allows(FULL_ACCESS, 'read', null)).toBe(false);
  });

  // Keys predate scopes. Refusing them would be an outage wearing a badge.
  it('lets a key with no scopes stored do everything', () => {
    for (const resource of SCOPE_RESOURCES) {
      expect(allows([], 'write', resource)).toBe(true);
    }
  });
});

describe('describing a scope to a person', () => {
  it('says what it is', () => {
    expect(describeScopes([])).toBe('Everything this client has');
    expect(describeScopes(READ_ONLY)).toBe('read everything');
    expect(describeScopes(['read:contacts', 'read:deals', 'write:deals'])).toBe('read contacts, deals; write deals');
  });
});
