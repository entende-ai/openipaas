import { cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

/**
 * Runs the production build the way `next start` cannot.
 *
 * With `output: 'standalone'`, Next emits a self-contained server that expects
 * static assets beside it. `next start` warns and does not serve that output,
 * so this copies the two directories the build leaves behind and hands over.
 *
 * The Dockerfile does the same copies as image layers; this is the equivalent
 * for running the build directly on a host.
 */

const STANDALONE = '.next/standalone';

if (!existsSync(`${STANDALONE}/server.js`)) {
  console.error('No standalone build found. Run `npm run build` first.');
  process.exit(1);
}

cpSync('.next/static', `${STANDALONE}/.next/static`, { recursive: true });
if (existsSync('public')) cpSync('public', `${STANDALONE}/public`, { recursive: true });

// stdio inherit so the server's own logs and exit code pass straight through.
const server = spawn(process.execPath, [`${STANDALONE}/server.js`], { stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));
