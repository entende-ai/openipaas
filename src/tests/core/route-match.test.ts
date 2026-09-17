import { describe, it, expect } from 'vitest';
import { readMatch, readUpsertBody } from '@/lib/route-match';

/**
 * Reading a natural-key match off a request.
 *
 * Shared by the search and upsert routes, which is the point: a missing field
 * must be refused the same way in both, and neither may hand a provider half a
 * match and let it decide what that means.
 */

describe('a match from the query string', () => {
  it('reads field and value, trimmed', () => {
    const params = new URLSearchParams({ field: ' email ', value: ' ana@example.com ' });
    expect(readMatch(params)).toEqual({ field: 'email', value: 'ana@example.com' });
  });

  it('refuses half a match rather than passing it on', () => {
    expect(() => readMatch(new URLSearchParams({ field: 'email' }))).toThrow(/needs a field and a value/);
    expect(() => readMatch(new URLSearchParams({ value: 'ana@example.com' }))).toThrow(/needs a field and a value/);
    expect(() => readMatch(new URLSearchParams({ field: 'email', value: '   ' }))).toThrow(/needs a field and a value/);
  });
});

describe('an upsert body', () => {
  it('accepts the match flat or nested, because both read naturally', () => {
    expect(readUpsertBody({ field: 'email', value: 'a@b.c', data: { name: 'Ana' } })).toEqual({
      match: { field: 'email', value: 'a@b.c' },
      data: { name: 'Ana' },
    });

    expect(readUpsertBody({ match: { field: 'email', value: 'a@b.c' }, data: { name: 'Ana' } })).toEqual({
      match: { field: 'email', value: 'a@b.c' },
      data: { name: 'Ana' },
    });
  });

  it('treats a missing data object as writing nothing, not as an error', () => {
    // An upsert with no fields is a "make sure this exists" call, which is valid.
    expect(readUpsertBody({ field: 'email', value: 'a@b.c' }).data).toEqual({});
  });

  it('refuses a body that is not a match at all', () => {
    expect(() => readUpsertBody({})).toThrow(/needs a field and a value/);
    expect(() => readUpsertBody(null)).toThrow(/needs a field and a value/);
    expect(() => readUpsertBody({ field: 'email', value: 'a@b.c', data: ['nope'] })).toThrow(/must be an object/);
  });

  it('refuses a value long enough to be a query rather than an email', () => {
    expect(() => readUpsertBody({ field: 'email', value: 'x'.repeat(513), data: {} })).toThrow(/longer than/);
  });
});
