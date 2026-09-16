import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

/**
 * The console pages, kept consistent with each other.
 *
 * Five pages had drifted into four different headings (h2 bold on four, h1
 * semibold on the fifth) and five copies of the same wrapper, one of which was
 * missing its max-width and so rendered wider than the rest. Nobody chose that;
 * it accumulated. These tests are the cheap way to stop it accumulating again.
 *
 * There is no DOM in this suite, so this reads the source. It checks the shape
 * a page is built from, not how it looks.
 */

const DASHBOARD = 'src/app/dashboard';

function pageFiles(dir = DASHBOARD): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'components' ? [] : pageFiles(full);
    return entry.name === 'page.tsx' ? [full.split(path.sep).join('/')] : [];
  });
}

const PAGES = pageFiles();

describe('console pages', () => {
  it('finds the pages at all', () => {
    // Guards against a rename quietly turning every test below into a no-op.
    expect(PAGES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(PAGES)('opens with the shared header: %s', (file) => {
    const source = readFileSync(file, 'utf8');

    expect(source, `${file} builds its own page title`).toContain('<PageHeader');
    // A hand-rolled heading is how the last drift started.
    expect(source, `${file} has a heading of its own`).not.toMatch(/<h1|<h2/);
  });

  it.each(PAGES)('leaves the page width to the layout: %s', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source, `${file} sets its own max width`).not.toMatch(/max-w-\d/);
  });

  it('puts the title in an h1, once', () => {
    const header = readFileSync('src/components/dashboard/PageHeader.tsx', 'utf8');

    // Every dashboard page used to start at h2, so none of them had an h1 for a
    // screen reader to announce.
    expect(header).toContain('<h1');
  });
});
