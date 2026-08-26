/**
 * Runs once per server instance, before the first request is served.
 *
 * The only job today is refusing to boot a production process that is still
 * holding the development secrets published in docker-compose.yml.
 */
export async function register() {
  // Edge gets its own instance of this hook, and has no business re-running a
  // check the Node server already made. The build also initialises a server to
  // prerender pages; failing there would break CI for a runtime concern.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { assertProductionSecrets } = await import('./lib/env-guard');
  assertProductionSecrets();
}
