import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Guards against npm bug 4828: regenerating the lockfile with a node_modules
 * already present records only the optional dependencies installed on that
 * machine. Native packages ship one optional dependency per platform, so a
 * lockfile regenerated on Windows kept the Windows binding and dropped the rest.
 *
 * That happened here: 78 bindings were missing across @tailwindcss/oxide,
 * sharp, esbuild, unrs-resolver and fsevents. oxide was the visible one, with 2
 * of its 12 bindings left, and every build outside Windows and x64 Linux failed
 * with "Cannot find native binding": the arm64 image published from master,
 * `docker compose up` on Apple Silicon, `npm run dev` on any Mac. sharp had lost
 * even its x64 Linux binding, which is the production image. Nothing in CI
 * noticed, because CI runs on x64 Linux and esbuild and unrs-resolver download
 * their binary in a postinstall script when the lockfile lacks it.
 *
 * Do not fix a failure here by pinning one binding in package.json, which is
 * how this was papered over before. `npm install --package-lock-only` does not
 * help either: it reports the lockfile up to date, even with no node_modules.
 * Add the missing entries at the exact version the parent declares, then let
 * `npm install --package-lock-only` normalize them. Deleting the parent's entry
 * to force a re-resolve works too, but can silently move its version, and
 * dropped sharp from the lockfile altogether when tried here.
 */

type LockEntry = { version?: string; optionalDependencies?: Record<string, string> };

function loadLock(file = path.resolve(__dirname, '../../../package-lock.json')): Record<string, LockEntry> {
  return JSON.parse(fs.readFileSync(file, 'utf8')).packages;
}

/** Node's resolution: the package's own node_modules, each ancestor's, then the root. */
function resolves(packages: Record<string, LockEntry>, from: string, dependency: string): boolean {
  let dir = from;
  for (;;) {
    if (`${dir}/node_modules/${dependency}` in packages) return true;
    const cut = dir.lastIndexOf('/node_modules/');
    if (cut === -1) return `node_modules/${dependency}` in packages;
    dir = dir.slice(0, cut);
  }
}

function missingOptionalDependencies(packages: Record<string, LockEntry>): string[] {
  const missing: string[] = [];
  for (const [location, entry] of Object.entries(packages)) {
    if (location === '') continue;
    for (const dependency of Object.keys(entry.optionalDependencies ?? {})) {
      if (!resolves(packages, location, dependency)) {
        missing.push(`${location.split('node_modules/').pop()} -> ${dependency}`);
      }
    }
  }
  return missing.sort();
}

describe('package-lock.json', () => {
  it('records every platform binding that native packages declare', () => {
    expect(missingOptionalDependencies(loadLock())).toEqual([]);
  });

  it('reports the bindings a Windows-regenerated lockfile drops', () => {
    // The shape the lockfile had: @tailwindcss/oxide with only two bindings.
    const broken: Record<string, LockEntry> = {
      '': {},
      'node_modules/@tailwindcss/oxide': {
        version: '4.2.4',
        optionalDependencies: {
          '@tailwindcss/oxide-darwin-arm64': '4.2.4',
          '@tailwindcss/oxide-linux-arm64-gnu': '4.2.4',
          '@tailwindcss/oxide-linux-x64-gnu': '4.2.4',
          '@tailwindcss/oxide-win32-x64-msvc': '4.2.4',
        },
      },
      'node_modules/@tailwindcss/oxide-linux-x64-gnu': { version: '4.2.4' },
      'node_modules/@tailwindcss/oxide-win32-x64-msvc': { version: '4.2.4' },
    };

    expect(missingOptionalDependencies(broken)).toEqual([
      '@tailwindcss/oxide -> @tailwindcss/oxide-darwin-arm64',
      '@tailwindcss/oxide -> @tailwindcss/oxide-linux-arm64-gnu',
    ]);
  });

  it('follows nested installs the way Node resolves them', () => {
    const nested: Record<string, LockEntry> = {
      'node_modules/a': { optionalDependencies: { b: '1' } },
      'node_modules/a/node_modules/b': {},
      'node_modules/c/node_modules/d': { optionalDependencies: { e: '1' } },
      'node_modules/e': {},
    };

    expect(missingOptionalDependencies(nested)).toEqual([]);
  });
});
