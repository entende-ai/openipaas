import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { PUBLISHED_DEV_SECRETS } from '../src/lib/env-guard';

/**
 * Writes a ready to run `.env` from `.env.example`, generating every secret.
 *
 * The alternative was telling people to run `openssl rand -base64 32` four
 * times, which is a copy paste ritual that fails outright on Windows, where
 * openssl is not installed by default.
 *
 * Only keys listed in GENERATED are filled, and only where the example still
 * holds a blank or a published development default. Everything else is left
 * alone, so provider OAuth credentials stay obviously unset and a value someone
 * chose deliberately is never rotated behind their back.
 *
 *   npm run setup:env
 *   npm run setup:env -- --force     overwrite an existing .env
 *   npm run setup:env -- --print     print the values, write nothing
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const EXAMPLE = path.join(ROOT, '.env.example');
const TARGET = path.join(ROOT, '.env');

const FORCE = process.argv.includes('--force');
const PRINT_ONLY = process.argv.includes('--print');

/** Keys this script is allowed to fill, and how to generate each one. */
const GENERATED: Record<string, () => string> = {
  // 32 bytes exactly: crypto.ts rejects anything else.
  CREDENTIALS_ENCRYPTION_KEY: () => crypto.randomBytes(32).toString('base64'),
  DASHBOARD_SESSION_SECRET: () => crypto.randomBytes(32).toString('base64'),
  INTERNAL_JOB_SECRET: () => crypto.randomBytes(32).toString('base64'),
  // Typed by a human at a login form, so base64url avoids the shell hostile
  // characters that base64 can produce.
  DASHBOARD_PASSWORD: () => crypto.randomBytes(18).toString('base64url'),
};

function fill(line: string): string {
  const match = /^([A-Z_0-9]+)=(.*)$/.exec(line);
  if (!match) return line;

  const [, name, rawValue] = match;
  const generate = GENERATED[name];
  if (!generate) return line;

  const value = rawValue.trim().replace(/^["']|["']$/g, '');

  // Replace a blank, or a default that is published in this repository and so
  // protects nothing. Any other value was chosen on purpose: leave it.
  const replaceable = value === '' || value === PUBLISHED_DEV_SECRETS[name];
  return replaceable ? `${name}="${generate()}"` : line;
}

function main() {
  if (!fs.existsSync(EXAMPLE)) {
    console.error('Could not find .env.example. Run this from the repository root.');
    process.exit(1);
  }

  const filled = fs.readFileSync(EXAMPLE, 'utf8').split('\n').map(fill).join('\n');

  if (PRINT_ONLY) {
    const secrets = filled
      .split('\n')
      .filter((line) => Object.keys(GENERATED).some((key) => line.startsWith(`${key}=`)));
    console.log(secrets.join('\n'));
    return;
  }

  if (fs.existsSync(TARGET) && !FORCE) {
    console.log('.env already exists, leaving it alone.');
    console.log('  npm run setup:env -- --force   to regenerate');
    console.log('  npm run setup:env -- --print   to print fresh secrets without writing');
    return;
  }

  // --force rotates CREDENTIALS_ENCRYPTION_KEY, which orphans every credential
  // already in the database. Keep the old file so that is recoverable.
  if (fs.existsSync(TARGET)) {
    const backup = `${TARGET}.backup`;
    fs.copyFileSync(TARGET, backup);
    console.log(`Existing .env saved to ${path.basename(backup)}`);
  }

  fs.writeFileSync(TARGET, filled, { mode: 0o600 });

  const password = /^DASHBOARD_PASSWORD="(.+)"$/m.exec(filled)?.[1];

  console.log('Wrote .env with generated secrets.');
  console.log('');
  console.log(`  Dashboard password: ${password}`);
  console.log('');
  console.log('Next:  docker compose up --build');
  console.log('');
  console.log('CREDENTIALS_ENCRYPTION_KEY decrypts every stored provider token.');
  console.log('Losing it means every connected account has to be reconnected.');
}

main();
