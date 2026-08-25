import type { Redis } from 'ioredis';

/**
 * Optional shared state.
 *
 * Redis is what makes rate limiting and idempotency correct across more than one
 * instance. It stays optional on purpose: a single-container self-host works
 * without it, and the in-memory fallbacks behave identically for one instance.
 *
 * Set REDIS_URL to enable it. In a multi-instance deployment it is required —
 * without it each instance enforces its own private limit.
 *
 * The client is imported dynamically: ioredis pulls in Node built-ins (dns, net,
 * tls) that the bundler cannot resolve, and a static import would drag them into
 * every build whether or not Redis is configured.
 */

let clientPromise: Promise<Redis | null> | null = null;
let override: Redis | null = null;
let overrideSet = false;

async function connect(url: string): Promise<Redis | null> {
  try {
    const { default: RedisClient } = await import('ioredis');

    const client = new RedisClient(url, {
      // Never let a Redis hiccup hold an API request hostage: commands fail fast
      // and callers fall back to local state.
      maxRetriesPerRequest: 2,
      connectTimeout: 3_000,
      enableOfflineQueue: false,
    });

    client.on('error', (err: Error) => console.error('[redis] connection error:', err.message));
    client.on('connect', () =>
      console.log('[redis] connected; rate limiting is now shared across instances.')
    );

    return client;
  } catch (err) {
    console.error('[redis] could not initialise, falling back to in-memory state:', (err as Error).message);
    return null;
  }
}

export async function getRedis(): Promise<Redis | null> {
  if (overrideSet) return override;

  const url = (process.env.REDIS_URL || '').trim();
  if (!url) return null;

  if (!clientPromise) clientPromise = connect(url);
  return clientPromise;
}

export async function isRedisEnabled(): Promise<boolean> {
  return (await getRedis()) !== null;
}

/** Test seam: injects a stub without touching the real client. */
export function __setRedisForTests(instance: Redis | null) {
  override = instance;
  overrideSet = true;
}

export function __resetRedis() {
  override = null;
  overrideSet = false;
  clientPromise = null;
}
