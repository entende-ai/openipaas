import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { openApiSpec } from '@/lib/openapi';
import { listManifests } from '@/lib/providers/core/manifests';

/**
 * The guide is prose, and prose rots quietly.
 *
 * These tests do not check that it reads well. They check the things a reader
 * would copy and paste: the routes, the headers and the error codes. A renamed
 * route now fails here instead of in somebody's terminal.
 */

const GUIDE = readFileSync('docs/INTEGRATION.md', 'utf8');
const paths = Object.keys(openApiSpec.paths as Record<string, unknown>);

function routesInGuide(): string[] {
  // A route quoted in inline code ends at the backtick, not after it.
  const matches = GUIDE.matchAll(/\/api\/unified\/v1(\/[^\s"'?`]*)/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

describe('integration guide', () => {
  it('only shows routes the API actually serves', () => {
    for (const route of routesInGuide()) {
      // Passthrough takes the provider's own path after the prefix.
      const known = route.startsWith('/passthrough/') || paths.includes(route);
      expect(known, `${route} appears in the guide but is not in the spec`).toBe(true);
    }
  });

  it('shows enough routes to be a guide at all', () => {
    // Guards against the regex silently matching nothing after a rewrite.
    expect(routesInGuide().length).toBeGreaterThan(3);
  });

  it('names both required headers', () => {
    expect(GUIDE).toContain('Authorization: Bearer');
    expect(GUIDE).toContain('X-Account-Token');
  });

  it('documents every error code the API can return', () => {
    const schema = (openApiSpec.components as any).schemas.Error;
    const codes: string[] = schema.properties.code.enum;

    for (const code of codes) {
      // INTERNAL_ERROR is deliberately not in the table: there is nothing the
      // caller can do about it, and the table is a "what to do" list.
      if (code === 'INTERNAL_ERROR') continue;
      expect(GUIDE, `${code} is missing from the error table`).toContain(`\`${code}\``);
    }
  });

  it('does not invent error codes', () => {
    const schema = (openApiSpec.components as any).schemas.Error;
    const codes: string[] = schema.properties.code.enum;
    // Service names share the SHOUTING_CASE of error codes and are documented on
    // purpose, as what X-Provider takes. They are checked against the catalog
    // instead, so a renamed provider still fails here.
    const slugs = new Set(listManifests().map((manifest) => manifest.slug));
    const mentioned = [...GUIDE.matchAll(/`([A-Z]+_[A-Z_]+)`/g)].map((m) => m[1]).filter((name) => !slugs.has(name));

    for (const code of new Set(mentioned)) {
      expect(codes, `${code} is documented but is not a real code`).toContain(code);
    }
  });

  // The service names the guide tells people to send must exist, or X-Provider
  // answers 400 to someone following the guide word for word.
  it('only names services that exist', () => {
    const slugs = new Set(listManifests().map((manifest) => manifest.slug));
    const named = [...GUIDE.matchAll(/X-Provider: ([A-Za-z_]+)/g)].map((m) => m[1].toUpperCase());

    expect(named.length).toBeGreaterThan(0);
    for (const slug of named) expect(slugs, `${slug} is not a provider`).toContain(slug);
  });
});
