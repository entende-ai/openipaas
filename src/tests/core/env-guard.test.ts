import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  InsecureProductionConfigError,
  PUBLISHED_DEV_SECRETS,
  assertProductionSecrets,
  findPublishedSecrets,
} from '@/lib/env-guard';

const ROOT = path.resolve(__dirname, '../../..');
const COMPOSE = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
const EXAMPLE = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');

/** `- NAME=${NAME:-default}` as written in the compose file. */
function composeDefault(name: string): string | null {
  const match = new RegExp(`^\\s*-\\s*${name}=\\$\\{${name}:-(.*)\\}\\s*$`, 'm').exec(COMPOSE);
  return match ? match[1] : null;
}

function exampleValue(name: string): string | null {
  const match = new RegExp(`^${name}="?(.*?)"?\\s*$`, 'm').exec(EXAMPLE);
  return match ? match[1] : null;
}

describe('env-guard', () => {
  describe('production', () => {
    it('refuses to start when a published secret is in place', () => {
      const env = {
        NODE_ENV: 'production',
        CREDENTIALS_ENCRYPTION_KEY: PUBLISHED_DEV_SECRETS.CREDENTIALS_ENCRYPTION_KEY,
      } as unknown as NodeJS.ProcessEnv;

      expect(() => assertProductionSecrets(env)).toThrow(InsecureProductionConfigError);
    });

    it('names every offending variable, not just the first', () => {
      const env = { NODE_ENV: 'production', ...PUBLISHED_DEV_SECRETS } as unknown as NodeJS.ProcessEnv;

      try {
        assertProductionSecrets(env);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InsecureProductionConfigError);
        expect((error as InsecureProductionConfigError).variables.sort()).toEqual(
          Object.keys(PUBLISHED_DEV_SECRETS).sort()
        );
      }
    });

    it('allows generated secrets through', () => {
      const env = {
        NODE_ENV: 'production',
        CREDENTIALS_ENCRYPTION_KEY: 'JMSVEcE0PMQvBmpxIsX0eXEsgi7dwHyKfxDTVIRvHSM=',
        DASHBOARD_PASSWORD: 'a-real-password',
        DASHBOARD_SESSION_SECRET: 'AXyLl9pyKq0hqRYrEDsSKHJ3XyWJXCcTOAo7EAiK6WU=',
        INTERNAL_JOB_SECRET: 'a-real-job-secret',
      } as unknown as NodeJS.ProcessEnv;

      expect(() => assertProductionSecrets(env)).not.toThrow();
    });

    it('allows an unset secret through, because missing is a separate failure', () => {
      // Absence is already handled where it matters: crypto.ts throws on write,
      // and the dashboard is unreachable without a session secret. Failing here
      // too would block a deployment that legitimately has no dashboard.
      expect(() => assertProductionSecrets({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).not.toThrow();
    });
  });

  it('leaves development alone, which is the entire point of the defaults', () => {
    const env = { NODE_ENV: 'development', ...PUBLISHED_DEV_SECRETS } as unknown as NodeJS.ProcessEnv;
    expect(() => assertProductionSecrets(env)).not.toThrow();
    expect(findPublishedSecrets(env)).toHaveLength(4);
  });

  it('ignores surrounding whitespace, which .env files pick up easily', () => {
    const env = {
      NODE_ENV: 'production',
      INTERNAL_JOB_SECRET: `  ${PUBLISHED_DEV_SECRETS.INTERNAL_JOB_SECRET}  `,
    } as unknown as NodeJS.ProcessEnv;

    expect(findPublishedSecrets(env)).toEqual(['INTERNAL_JOB_SECRET']);
  });

  /**
   * The guard is only worth anything if it knows every published value. These
   * read the shipped files rather than trusting the constant to be maintained,
   * so adding a default in one place and forgetting the other fails the build.
   */
  describe('stays in sync with the files that publish the defaults', () => {
    it.each(Object.keys(PUBLISHED_DEV_SECRETS))('docker-compose.yml default for %s', (name) => {
      expect(composeDefault(name)).toBe(PUBLISHED_DEV_SECRETS[name]);
    });

    it.each(Object.keys(PUBLISHED_DEV_SECRETS))('.env.example value for %s', (name) => {
      expect(exampleValue(name)).toBe(PUBLISHED_DEV_SECRETS[name]);
    });

    it('has no compose default the guard does not know about', () => {
      // Any secret-shaped variable given a literal fallback in compose has to be
      // declared, otherwise it silently becomes a production hole.
      const defaults = [...COMPOSE.matchAll(/^\s*-\s*([A-Z_0-9]+)=\$\{[A-Z_0-9]+:-(.+)\}\s*$/gm)]
        .filter(([, name]) => /SECRET|PASSWORD|KEY|TOKEN/.test(name))
        .map(([, name]) => name);

      expect(defaults.sort()).toEqual(Object.keys(PUBLISHED_DEV_SECRETS).sort());
    });
  });

  it('ships an encryption key crypto.ts will actually accept', () => {
    // A 31-byte default would turn `docker compose up` into a crash on first
    // credential write, which is exactly the experience these defaults exist to
    // prevent.
    expect(Buffer.from(PUBLISHED_DEV_SECRETS.CREDENTIALS_ENCRYPTION_KEY, 'base64')).toHaveLength(32);
    expect(Buffer.from(PUBLISHED_DEV_SECRETS.DASHBOARD_SESSION_SECRET, 'base64')).toHaveLength(32);
  });
});
