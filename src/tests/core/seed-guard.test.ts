import { describe, expect, it, vi } from 'vitest';

import { assertSeedable } from '../../../prisma/seed-guard';

const env = (overrides: Record<string, string>) => overrides as unknown as NodeJS.ProcessEnv;

/**
 * The seed deletes every row. These tests are the difference between that being
 * a development convenience and a way to lose production data.
 */
describe('seed guard', () => {
  it.each([
    'postgresql://postgres:postgres@localhost:5432/ipaas_dev',
    'postgresql://postgres:postgres@127.0.0.1:5432/ipaas_dev',
    // The docker-compose service names, resolvable only inside its network.
    'postgresql://postgres:postgres@db:5432/ipaas_dev',
    'postgresql://postgres:postgres@postgres:5432/ipaas_dev',
    'postgresql://postgres:postgres@host.docker.internal:5432/ipaas_dev',
  ])('allows %s', (url) => {
    expect(() => assertSeedable(env({ DATABASE_URL: url }))).not.toThrow();
  });

  it.each([
    ['Neon', 'postgresql://u:p@ep-cool-name.eu-central-1.aws.neon.tech/db?sslmode=require'],
    ['Supabase', 'postgresql://postgres:p@db.abcdefgh.supabase.co:5432/postgres'],
    ['Railway', 'postgresql://postgres:p@containers-us-west-1.railway.app:6543/railway'],
    ['a bare IP', 'postgresql://u:p@10.0.0.4:5432/db'],
  ])('refuses %s', (_label, url) => {
    expect(() => assertSeedable(env({ DATABASE_URL: url }))).toThrow(/not a local database/);
  });

  it('refuses when DATABASE_URL is unset, rather than treating absence as safe', () => {
    expect(() => assertSeedable(env({}))).toThrow(/missing or could not be parsed/);
  });

  it('refuses a URL it cannot parse', () => {
    expect(() => assertSeedable(env({ DATABASE_URL: 'not a url' }))).toThrow(/could not be parsed/);
  });

  it('allows a remote database only on an explicit opt in', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const remote = { DATABASE_URL: 'postgresql://u:p@db.example.com:5432/db' };

    expect(() => assertSeedable(env(remote))).toThrow();
    expect(() =>
      assertSeedable(env({ ...remote, ALLOW_SEED_ON_REMOTE_DATABASE: 'true' }))
    ).not.toThrow();

    // Silently proceeding would make the opt in easy to forget about later.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('db.example.com'));
    warn.mockRestore();
  });

  it('does not accept a value that merely looks truthy as the opt in', () => {
    const remote = { DATABASE_URL: 'postgresql://u:p@db.example.com:5432/db' };
    for (const value of ['1', 'yes', 'TRUE', 'true ']) {
      expect(() => assertSeedable(env({ ...remote, ALLOW_SEED_ON_REMOTE_DATABASE: value }))).toThrow();
    }
  });

  it('is not fooled by a hostname that merely contains a local name', () => {
    // `localhost.attacker.example` and `db.example.com` both end up here.
    expect(() =>
      assertSeedable(env({ DATABASE_URL: 'postgresql://u:p@localhost.example.com:5432/db' }))
    ).toThrow(/not a local database/);
  });

  it('ignores case in the hostname', () => {
    expect(() =>
      assertSeedable(env({ DATABASE_URL: 'postgresql://u:p@LOCALHOST:5432/db' }))
    ).not.toThrow();
  });
});
