/**
 * Decides whether the seed is allowed to run, given that it deletes every row.
 *
 * Lives outside seed.ts because that module runs on import, which makes it
 * impossible to test. This guard is the only thing standing between a stray
 * RUN_SEED=true and somebody's production data, so it gets tested.
 *
 * NODE_ENV was the previous guard and was the wrong signal: the production
 * image bakes in NODE_ENV=production, which blocked the seed inside the
 * project's own docker-compose while still permitting it anywhere the variable
 * happened to be unset. What matters is not how the process was built, but
 * which database is about to be erased.
 */

/**
 * Hosts that cannot be anyone's real data: loopback, plus the service names
 * used by docker-compose, which only resolve inside the compose network.
 */
const DISPOSABLE_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'db',
  'postgres',
  'host.docker.internal',
];

export function assertSeedable(env: NodeJS.ProcessEnv = process.env): void {
  const url = (env.DATABASE_URL || '').trim();

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Deny by default. An unreadable URL is not evidence of safety.
    throw new Error('Refusing to seed: DATABASE_URL is missing or could not be parsed.');
  }

  if (DISPOSABLE_HOSTS.includes(host)) return;

  if (env.ALLOW_SEED_ON_REMOTE_DATABASE === 'true') {
    console.warn(`Seeding ${host}, a remote database, as explicitly allowed.`);
    return;
  }

  throw new Error(
    `Refusing to seed: ${host} is not a local database, and this script deletes every row.\n` +
      'Set ALLOW_SEED_ON_REMOTE_DATABASE=true if it really is disposable.'
  );
}
