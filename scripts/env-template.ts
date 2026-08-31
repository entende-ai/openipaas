import crypto from 'crypto';

import { PUBLISHED_DEV_SECRETS } from '../src/lib/env-guard';

/**
 * Turns `.env.example` into a `.env` with every secret generated.
 *
 * Pure, and separate from setup-env.ts, because that module does IO and runs on
 * import. This is the part worth testing: a bug here does not crash, it hands
 * back configuration that looks generated and is not.
 */

/** Keys this script may fill, and how each one is generated. */
export const GENERATED: Record<string, () => string> = {
  // 32 bytes exactly: crypto.ts rejects anything else.
  CREDENTIALS_ENCRYPTION_KEY: () => crypto.randomBytes(32).toString('base64'),
  DASHBOARD_SESSION_SECRET: () => crypto.randomBytes(32).toString('base64'),
  INTERNAL_JOB_SECRET: () => crypto.randomBytes(32).toString('base64'),
  // Typed by a human at a login form, so base64url avoids the shell hostile
  // characters that base64 can produce.
  DASHBOARD_PASSWORD: () => crypto.randomBytes(18).toString('base64url'),
};

function fillLine(line: string): string {
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

export class PublishedSecretLeakedError extends Error {
  constructor(public readonly variables: string[]) {
    super(
      `Refusing to continue: ${variables.join(', ')} came out holding the value ` +
        'published in this repository, so it is not a secret. This is a bug in ' +
        'scripts/env-template.ts, not in your setup.'
    );
    this.name = 'PublishedSecretLeakedError';
  }
}

export function fillEnvTemplate(example: string): string {
  // Split on either ending. A carriage return is a line terminator in
  // JavaScript, so `.` does not match one and the regex above fails on every
  // line of a CRLF file, which is what git checks out on Windows. That bug did
  // not throw: it returned the file unchanged, and the published development
  // defaults were handed back as freshly generated secrets.
  const filled = example.split(/\r?\n/).map(fillLine).join('\n');

  // Checking the output rather than trusting the logic above is what turns a
  // silent failure into a loud one.
  const leaked = Object.entries(PUBLISHED_DEV_SECRETS)
    .filter(([name, published]) => filled.includes(`${name}="${published}"`))
    .map(([name]) => name);

  if (leaked.length > 0) throw new PublishedSecretLeakedError(leaked);

  return filled;
}

/** The generated lines only, for pasting into a host's dashboard. */
export function secretLines(filled: string): string[] {
  return filled
    .split('\n')
    .filter((line) => Object.keys(GENERATED).some((key) => line.startsWith(`${key}=`)));
}
