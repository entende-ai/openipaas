import { describe, it, expect } from 'vitest';
import { connectionHealth, maskToken, formatDuration, connectionAbilities } from '@/lib/dashboard/connections';
import {
  playgroundOperations,
  normalizePassthroughPath,
  explainResult,
  isEmptyResult,
  pathOptions,
  initialPathChoice,
  chosenPath,
  CUSTOM_PATH,
} from '@/lib/dashboard/playground';
import { onboardingSteps, onboardingComplete } from '@/lib/dashboard/onboarding';
import { tinyManifest } from '@/lib/providers/implementations/tiny/manifest';
import { contaAzulManifest } from '@/lib/providers/implementations/contaazul/manifest';

const now = new Date('2026-09-16T12:00:00Z');
const inMinutes = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

describe('connection health', () => {
  // The screen used to print "Connected" next to every row, including rows
  // whose token had expired hours earlier.
  it('reports a live token with how long it has left', () => {
    const health = connectionHealth({ hasCredential: true, expiresAt: inMinutes(120), now });

    expect(health.state).toBe('active');
    expect(health.detail).toContain('2 hours');
    expect(health.needsAttention).toBe(false);
  });

  it('flags a token that is about to expire', () => {
    expect(connectionHealth({ hasCredential: true, expiresAt: inMinutes(5), now }).state).toBe('expiring');
  });

  it('treats an expired token with a refresh token as something that fixes itself', () => {
    const health = connectionHealth({
      hasCredential: true,
      expiresAt: inMinutes(-30),
      hasRefreshToken: true,
      now,
    });

    expect(health.state).toBe('stale');
    expect(health.needsAttention).toBe(false);
    expect(health.detail).toContain('renews');
  });

  it('asks for a reconnect when an expired token cannot be renewed', () => {
    const health = connectionHealth({ hasCredential: true, expiresAt: inMinutes(-30), hasRefreshToken: false, now });

    expect(health.state).toBe('expired');
    expect(health.needsAttention).toBe(true);
  });

  it('says so when there is no credential at all', () => {
    expect(connectionHealth({ hasCredential: false, now })).toMatchObject({ state: 'missing', needsAttention: true });
  });

  it('does not invent an expiry the provider never reported', () => {
    const health = connectionHealth({ hasCredential: true, expiresAt: null, now });

    expect(health.state).toBe('active');
    expect(health.needsAttention).toBe(false);
  });
});

describe('durations', () => {
  it('rounds to something a person would say', () => {
    expect(formatDuration(30 * 1000)).toBe('less than a minute');
    expect(formatDuration(60 * 1000)).toBe('1 minute');
    expect(formatDuration(45 * 60 * 1000)).toBe('45 minutes');
    expect(formatDuration(2 * 60 * 60 * 1000)).toBe('2 hours');
    expect(formatDuration(50 * 60 * 60 * 1000)).toBe('2 days');
  });
});

describe('token masking', () => {
  it('keeps enough to recognise the token and not enough to use it', () => {
    const token = 'acct_9f2b1c4d5e6f7a8b9c0d';
    const masked = maskToken(token);

    expect(masked.startsWith('acct_9f2')).toBe(true);
    expect(masked.endsWith('9c0d')).toBe(true);
    expect(masked).not.toContain('b1c4d5e6f7a8b');
  });

  it('never shows a short token in full', () => {
    expect(maskToken('short-token')).toBe('sh•••••••••');
    expect(maskToken('')).toBe('');
  });
});

describe('playground operations', () => {
  // The whole reason the old playground was useless for a provider that has
  // only passthrough, as RD Station had before the CRM mappers landed.
  it('offers nothing unified for a passthrough-only provider', () => {
    expect(playgroundOperations(tinyManifest)).toEqual([]);
    expect(connectionAbilities(tinyManifest)).toEqual({ unified: [], passthrough: true });
  });

  it('offers exactly what a provider declares', () => {
    const operations = playgroundOperations(contaAzulManifest);

    expect(operations.length).toBeGreaterThan(0);
    for (const operation of operations) {
      expect(contaAzulManifest.capabilities[operation.resource]).toContain('list');
      expect(operation.method).toBe('GET');
      expect(operation.path.startsWith('/')).toBe(true);
    }
  });
});

describe('passthrough paths', () => {
  it('accepts a relative path, with or without the leading slash', () => {
    expect(normalizePassthroughPath('/contacts')).toEqual({ path: '/contacts' });
    expect(normalizePassthroughPath(' deals?limit=5 ')).toEqual({ path: '/deals?limit=5' });
  });

  // Otherwise the account's access token goes to whatever host was typed.
  it('refuses an absolute URL', () => {
    expect(normalizePassthroughPath('https://evil.example.com/steal')).toHaveProperty('error');
    expect(normalizePassthroughPath('//evil.example.com/steal')).toHaveProperty('error');
    expect(normalizePassthroughPath('javascript:alert(1)')).toHaveProperty('error');
  });

  it('refuses traversal and emptiness', () => {
    expect(normalizePassthroughPath('/contacts/../../admin')).toHaveProperty('error');
    expect(normalizePassthroughPath('   ')).toHaveProperty('error');
  });
});

describe('choosing a path', () => {
  const EXAMPLES = [
    { path: '/contacts', label: 'Contacts' },
    { path: '/deals', label: 'Deals' },
  ];

  it('offers the provider\'s own paths, and typing as the last resort', () => {
    const options = pathOptions(EXAMPLES);

    expect(options.map((option) => option.value)).toEqual(['/contacts', '/deals', CUSTOM_PATH]);
    expect(options[0].label).toBe('Contacts');
    // Typing must stay reachable: a manifest lists four paths out of dozens.
    expect(options.at(-1)?.value).toBe(CUSTOM_PATH);
  });

  it('opens on a real path when there is one, and on the text box otherwise', () => {
    expect(initialPathChoice(EXAMPLES)).toBe('/contacts');
    expect(initialPathChoice([])).toBe(CUSTOM_PATH);
    // With nothing to suggest, the dropdown would hold only "Other".
    expect(pathOptions([])).toHaveLength(1);
  });

  it('sends the typed path only when Other is selected', () => {
    expect(chosenPath('/deals', '/whatever')).toBe('/deals');
    expect(chosenPath(CUSTOM_PATH, '/whatever')).toBe('/whatever');
    // An empty text box then fails validation, which says what to type.
    expect(normalizePassthroughPath(chosenPath(CUSTOM_PATH, ''))).toHaveProperty('error');
  });
});

describe('explaining a result', () => {
  // The first real call against RD Station returned {"data": []} with a 200,
  // which reads like a failure to anyone who has not seen the API before.
  it('says an empty list is a success, not a problem', () => {
    const message = explainResult({ status: 200, providerName: 'RD Station CRM', data: { data: [] }, path: '/contacts' });

    expect(message).toContain('It worked');
    expect(message).toContain('no records');
    expect(message).toContain('/contacts');
  });

  it('recognises emptiness in the shapes providers actually return', () => {
    expect(isEmptyResult([])).toBe(true);
    expect(isEmptyResult({ data: [] })).toBe(true);
    expect(isEmptyResult({ items: [] })).toBe(true);
    expect(isEmptyResult({ sample: [] })).toBe(true);
    expect(isEmptyResult({ data: [{ id: '1' }] })).toBe(false);
    expect(isEmptyResult({ id: '1' })).toBe(false);
    expect(isEmptyResult(null)).toBe(false);
  });

  it('turns each failure into the next thing to do', () => {
    const provider = 'RD Station CRM';

    expect(explainResult({ status: 404, providerName: provider, path: '/contatos' })).toContain('no such path');
    expect(explainResult({ status: 401, providerName: provider })).toContain('connect the account again');
    expect(explainResult({ status: 429, providerName: provider })).toContain('rate limiting');
    expect(explainResult({ status: 503, providerName: provider })).toContain('their side');
    expect(explainResult({ status: 501, providerName: provider })).toContain('not implemented');
  });
});

describe('onboarding', () => {
  it('points at the first thing that is missing', () => {
    const steps = onboardingSteps({ clients: 1, activeKeys: 0, connections: 0, requests: 0 });

    expect(steps.find((step) => step.current)?.id).toBe('key');
    expect(onboardingComplete(steps)).toBe(false);
  });

  it('still points at the earliest gap when a later step is already done', () => {
    // A request can predate the client you just added.
    const steps = onboardingSteps({ clients: 1, activeKeys: 0, connections: 1, requests: 5 });

    expect(steps.find((step) => step.current)?.id).toBe('key');
    expect(steps.filter((step) => step.current)).toHaveLength(1);
  });

  it('marks the tour finished once everything has happened', () => {
    const steps = onboardingSteps({ clients: 2, activeKeys: 3, connections: 1, requests: 12 });

    expect(onboardingComplete(steps)).toBe(true);
    expect(steps.some((step) => step.current)).toBe(false);
  });
});
