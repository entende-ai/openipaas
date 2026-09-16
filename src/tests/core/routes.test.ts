import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

/**
 * Links that answer 404.
 *
 * /dashboard had no page of its own, so the obvious URL 404ed, and signing in
 * from it did too: the login form returns you to where you came from. Nothing
 * failed at build time, because a missing route is only missing at runtime.
 */

function pageExists(route: string): boolean {
  const segments = route.replace(/^\//, '').split('/').filter(Boolean);
  const dir = path.join('src', 'app', ...segments);

  return ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].some((file) => existsSync(path.join(dir, file)));
}

describe('dashboard routes', () => {
  it('answers at /dashboard itself', () => {
    expect(pageExists('/dashboard')).toBe(true);
  });

  it('has a page behind every link in the sidebar', () => {
    const source = readFileSync(path.join('src', 'components', 'Sidebar.tsx'), 'utf8');
    const routes = [...source.matchAll(/href:\s*'([^']+)'/g)].map((match) => match[1]);

    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(pageExists(route), `${route} is in the sidebar but has no page`).toBe(true);
    }
  });

  it('lands signed-in visitors somewhere that exists', () => {
    // The fallback in src/app/actions/auth.ts, used whenever ?next= is missing
    // or points off-site.
    const source = readFileSync(path.join('src', 'app', 'actions', 'auth.ts'), 'utf8');
    const fallbacks = [...source.matchAll(/'(\/dashboard[^']*)'/g)].map((match) => match[1]);

    expect(fallbacks.length).toBeGreaterThan(0);
    for (const route of new Set(fallbacks)) {
      expect(pageExists(route), `${route} is the post-login destination but has no page`).toBe(true);
    }
  });
});
