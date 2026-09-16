import { SANDBOX_MARKER } from './crm-fixtures';

/**
 * Argument handling for scripts/seed-crm-sandbox.ts.
 *
 * Kept apart from the script so it can be tested without the script's main()
 * running on import, and because the guard rails here are the part worth
 * testing: this writes to a live CRM account.
 */

export interface SeedOptions {
  apiKey: string;
  accountToken: string;
  baseUrl: string;
  companies: number;
  contacts: number;
  deals: number;
  confirm: boolean;
}

export const SEED_DEFAULTS = {
  baseUrl: 'https://app.openipaas.com',
  companies: 5,
  contacts: 10,
  deals: 6,
};

/** A typo in a count should not cost ten thousand records. */
export const MAX_PER_RESOURCE = 50;

export const USAGE = `
Usage:
  npm run seed:crm -- --api-key <key> --account-token <token> [options]

Required:
  --api-key <key>            Client API key, from the dashboard under Clients.
  --account-token <token>    Linked account token, from Linked accounts.

Options:
  --base-url <url>           Default ${SEED_DEFAULTS.baseUrl}
  --companies <n>            Default ${SEED_DEFAULTS.companies}
  --contacts <n>             Default ${SEED_DEFAULTS.contacts}
  --deals <n>                Default ${SEED_DEFAULTS.deals}
  --confirm                  Actually write. Without it this is a dry run.
  --help

Every record is named with the ${SANDBOX_MARKER} marker so you can find and
delete it later. Point this at a trial or sandbox account, never at an account
with real customers in it.
`.trim();

export function parseArgs(argv: string[]): SeedOptions {
  const values = new Map<string, string>();
  let confirm = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);

    const key = arg.slice(2);
    if (key === 'confirm') {
      confirm = true;
      continue;
    }

    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`--${key} needs a value`);
    values.set(key, next);
    i++;
  }

  const count = (key: 'companies' | 'contacts' | 'deals'): number => {
    const raw = values.get(key);
    if (raw === undefined) return SEED_DEFAULTS[key];

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`--${key} must be a whole number`);
    if (parsed > MAX_PER_RESOURCE) throw new Error(`--${key} is capped at ${MAX_PER_RESOURCE}`);
    return parsed;
  };

  const apiKey = values.get('api-key');
  const accountToken = values.get('account-token');
  if (!apiKey) throw new Error('--api-key is required');
  if (!accountToken) throw new Error('--account-token is required');

  return {
    apiKey,
    accountToken,
    // A trailing slash here would produce a double slash in every path.
    baseUrl: (values.get('base-url') ?? SEED_DEFAULTS.baseUrl).replace(/\/+$/, ''),
    companies: count('companies'),
    contacts: count('contacts'),
    deals: count('deals'),
    confirm,
  };
}

/** Picks a reference deterministically, so a rerun spreads records the same way. */
export function assign<T>(pool: T[], index: number): T | null {
  return pool.length === 0 ? null : pool[index % pool.length];
}
