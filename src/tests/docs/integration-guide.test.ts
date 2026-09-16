import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { openApiSpec } from '@/lib/openapi';

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
  const matches = GUIDE.matchAll(/\/api\/unified\/v1(\/[^\s"'?]*)/g);
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
    const mentioned = [...GUIDE.matchAll(/`([A-Z]+_[A-Z_]+)`/g)].map((m) => m[1]);

    for (const code of new Set(mentioned)) {
      expect(codes, `${code} is documented but is not a real code`).toContain(code);
    }
  });
});
