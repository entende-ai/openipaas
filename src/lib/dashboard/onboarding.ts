/**
 * The order things have to happen in, and where the operator stopped.
 *
 * The console used to open on a table of clients with no hint that a client
 * needs a key, that a key is useless without a connected account, and that the
 * whole point is the call at the end.
 */

export interface OnboardingStep {
  id: 'client' | 'key' | 'connection' | 'call';
  title: string;
  description: string;
  done: boolean;
  /** The step to act on now: the first one that is not done. */
  current: boolean;
  href: string;
  action: string;
}

export function onboardingSteps(counts: {
  clients: number;
  activeKeys: number;
  connections: number;
  requests: number;
}): OnboardingStep[] {
  const done = {
    client: counts.clients > 0,
    key: counts.activeKeys > 0,
    connection: counts.connections > 0,
    call: counts.requests > 0,
  };

  const steps: Omit<OnboardingStep, 'current'>[] = [
    {
      id: 'client',
      title: 'Create a client',
      description: 'A client is whoever consumes your unified API: a customer, an internal app, a partner.',
      done: done.client,
      href: '/dashboard/clients',
      action: 'Go to clients',
    },
    {
      id: 'key',
      title: 'Issue an API key',
      description: 'The key identifies the client. It is shown once, at creation, and stored only as a hash.',
      done: done.key,
      href: '/dashboard/clients',
      action: 'Issue a key',
    },
    {
      id: 'connection',
      title: 'Connect an account',
      description: 'Link the client to a provider account. That is what the key is allowed to reach.',
      done: done.connection,
      href: '/dashboard/linked-accounts',
      action: 'Connect an account',
    },
    {
      id: 'call',
      title: 'Make a call',
      description: 'Try it from the playground, then from your own code with the key and the service name.',
      done: done.call,
      href: '/dashboard/linked-accounts',
      action: 'Open the playground',
    },
  ];

  // Later steps can be done out of order (a request can predate a new client),
  // so "current" is the first unfinished step, not the one after the last done.
  const firstUnfinished = steps.find((step) => !step.done)?.id;

  return steps.map((step) => ({ ...step, current: step.id === firstUnfinished }));
}

export function onboardingComplete(steps: OnboardingStep[]): boolean {
  return steps.every((step) => step.done);
}
