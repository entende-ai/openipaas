import fs from 'fs';
import path from 'path';

import { fillEnvTemplate, secretLines } from './env-template';

/**
 * Writes a ready to run `.env` from `.env.example`, generating every secret.
 *
 * The alternative was telling people to run `openssl rand -base64 32` four
 * times, which is a copy paste ritual that fails outright on Windows, where
 * openssl is not installed by default.
 *
 * The transformation lives in env-template.ts so it can be tested; this file is
 * the IO around it.
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

function main() {
  if (!fs.existsSync(EXAMPLE)) {
    console.error('Could not find .env.example. Run this from the repository root.');
    process.exit(1);
  }

  const filled = fillEnvTemplate(fs.readFileSync(EXAMPLE, 'utf8'));

  if (PRINT_ONLY) {
    console.log(secretLines(filled).join('\n'));
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

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
