/**
 * Refuses to boot in production with a secret that is published in this repo.
 *
 * `docker-compose.yml` ships working defaults so a fresh clone runs with no
 * setup at all. That convenience is only safe if the same file cannot reach a
 * real deployment unnoticed: these values sit in a public repository, so anyone
 * holding them can decrypt every stored provider token and sign themselves a
 * dashboard session.
 *
 * A loud crash at startup is the cheapest possible failure here. The value it
 * replaces is a platform that looks healthy while being trivially readable by
 * anyone who has read the repository.
 */

/**
 * The literal values in `docker-compose.yml`. Anything added there must be
 * added here, which `src/tests/core/env-guard.test.ts` enforces by parsing the
 * compose file rather than trusting this list to stay in sync by hand.
 */
export const PUBLISHED_DEV_SECRETS: Record<string, string> = {
  CREDENTIALS_ENCRYPTION_KEY: 'ZGV2ZWxvcG1lbnQtb25seS1lbmNyeXB0aW9uLWtleSE=',
  DASHBOARD_PASSWORD: 'development-only',
  DASHBOARD_SESSION_SECRET: 'ZGV2ZWxvcG1lbnQtb25seS1zZXNzaW9uLXNlY3JldCE=',
  INTERNAL_JOB_SECRET: 'development-only-job-secret',
};

/** Which published defaults are present in the given environment. */
export function findPublishedSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(PUBLISHED_DEV_SECRETS)
    .filter(([name, published]) => (env[name] || '').trim() === published)
    .map(([name]) => name);
}

export class InsecureProductionConfigError extends Error {
  constructor(public readonly variables: string[]) {
    super(
      [
        `Refusing to start: ${variables.join(', ')} still ${
          variables.length === 1 ? 'holds the value' : 'hold the values'
        } published in docker-compose.yml.`,
        '',
        'These are development defaults, readable by anyone who has seen the',
        'repository. In production they would expose every stored credential.',
        '',
        'Generate replacements with:  npm run setup:env -- --print',
      ].join('\n')
    );
    this.name = 'InsecureProductionConfigError';
  }
}

/**
 * Throws when a production process is configured with a published default.
 *
 * Called from `instrumentation.ts`, which Next runs once before the server
 * accepts requests.
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const exposed = findPublishedSecrets(env);
  if (exposed.length > 0) throw new InsecureProductionConfigError(exposed);
}
