import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  GENERATED,
  PublishedSecretLeakedError,
  fillEnvTemplate,
  secretLines,
} from '../../../scripts/env-template';
import { PUBLISHED_DEV_SECRETS } from '@/lib/env-guard';

const EXAMPLE = fs.readFileSync(path.resolve(__dirname, '../../../.env.example'), 'utf8');

/** The shipped example, normalized to the given line ending. */
function asTemplate(ending: '\n' | '\r\n'): string {
  return EXAMPLE.split(/\r?\n/).join(ending);
}

describe('env template', () => {
  /**
   * The CRLF case is why this file exists. Git checks out CRLF on Windows, a
   * carriage return is a line terminator in JavaScript so `.` does not match
   * one, and the parsing regex failed on every line. Nothing threw: the
   * published development defaults came back as though freshly generated, and
   * were very nearly deployed to production as real secrets.
   */
  describe.each([
    ['LF', '\n' as const],
    ['CRLF', '\r\n' as const],
  ])('with %s line endings', (_label, ending) => {
    it('generates every secret', () => {
      const filled = fillEnvTemplate(asTemplate(ending));

      for (const name of Object.keys(GENERATED)) {
        expect(filled).toMatch(new RegExp(`^${name}=".+"$`, 'm'));
      }
    });

    it('emits no value that is published in this repository', () => {
      const filled = fillEnvTemplate(asTemplate(ending));

      for (const [name, published] of Object.entries(PUBLISHED_DEV_SECRETS)) {
        expect(filled).not.toContain(`${name}="${published}"`);
      }
    });

    it('emits an encryption key crypto.ts will accept', () => {
      const filled = fillEnvTemplate(asTemplate(ending));
      const key = /^CREDENTIALS_ENCRYPTION_KEY="(.+)"$/m.exec(filled)?.[1];

      expect(key).toBeDefined();
      expect(Buffer.from(key!, 'base64')).toHaveLength(32);
    });

    it('always writes LF, whatever it was given', () => {
      expect(fillEnvTemplate(asTemplate(ending))).not.toContain('\r');
    });
  });

  it('leaves provider credentials blank, because nobody can generate those', () => {
    const filled = fillEnvTemplate(EXAMPLE);

    expect(filled).toMatch(/^CONTA_AZUL_CLIENT_ID=""$/m);
    expect(filled).toMatch(/^CONTA_AZUL_CLIENT_SECRET=""$/m);
  });

  it('leaves a value someone chose deliberately alone', () => {
    const filled = fillEnvTemplate('DASHBOARD_PASSWORD="a-password-i-picked"');

    expect(filled).toBe('DASHBOARD_PASSWORD="a-password-i-picked"');
  });

  it('generates a different value every run', () => {
    // A constant would satisfy every assertion above and still be worthless.
    const read = (s: string) => /^INTERNAL_JOB_SECRET="(.+)"$/m.exec(s)?.[1];

    expect(read(fillEnvTemplate(EXAMPLE))).not.toBe(read(fillEnvTemplate(EXAMPLE)));
  });

  it('throws rather than return a published default', () => {
    // Simulates the class of bug that caused this: parsing silently does
    // nothing, and the defaults survive into the output.
    const untouched = Object.entries(PUBLISHED_DEV_SECRETS)
      .map(([name, value]) => `${name}="${value}"`)
      .join('\n')
      // A leading space stops fillLine matching, exactly as \r used to.
      .replace(/^/gm, ' ');

    expect(() => fillEnvTemplate(untouched)).toThrow(PublishedSecretLeakedError);
  });

  it('prints only the generated lines', () => {
    const lines = secretLines(fillEnvTemplate(EXAMPLE));

    expect(lines).toHaveLength(Object.keys(GENERATED).length);
    expect(lines.join('\n')).not.toContain('DATABASE_URL');
  });
});
