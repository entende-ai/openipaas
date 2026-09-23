import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Submitting credentials from the hosted page.
 *
 * The dashboard's version of this starts by requiring a console session. This
 * one cannot: the person filling the form has no account here. The session
 * token is the whole of the authority, so what matters is that a bad or spent
 * token gets nothing, and that the client the account lands under comes from
 * the row rather than from anything the browser sent.
 */

type Row = Record<string, any>;

const state = vi.hoisted(() => ({
  session: null as Row | null,
  sessionState: 'ok' as 'ok' | 'invalid' | 'expired' | 'used',
  created: [] as Row[],
  deleted: [] as string[],
  claimed: true,
  events: [] as Row[],
  createdSessions: [] as Row[],
  signed: true,
  signedIn: true,
}));

vi.mock('@/lib/connect-session', async (importOriginal) => {
  // The URL readers are the real ones: what a person may type into the console
  // is exactly what a product may send to the admin API, and a second copy of
  // those rules would drift.
  const actual = await importOriginal<typeof import('@/lib/connect-session')>();

  return {
    readUrl: actual.readUrl,
    readOrigin: actual.readOrigin,
    resolveConnectSession: async () =>
      state.sessionState === 'invalid' ? { state: 'invalid' } : { state: state.sessionState, session: state.session },
    completeConnectSession: async () => state.claimed,
    createConnectSession: async (input: Row) => {
      state.createdSessions.push(input);
      return { id: 'session-new', token: 'tok', url: 'https://app.test/connect/tok', expiresAt: new Date() };
    },
  };
});

vi.mock('@/lib/connect-token', () => ({ connectSecretConfigured: () => state.signed }));

vi.mock('@/lib/auth-session', () => ({
  requireDashboardSession: async () => {
    if (!state.signedIn) throw new Error('not signed in');
    return { id: 'user-1' };
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'client-1' ? { id: 'client-1' } : null,
    },
    linkedAccount: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `linked-${state.created.length + 1}`, ...data };
        state.created.push(row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.deleted.push(where.id);
        return { id: where.id };
      },
    },
  },
}));

vi.mock('@/lib/webhooks', () => ({
  emitConnectionEvent: async (event: Row) => {
    state.events.push(event);
  },
}));

const { submitConnectCredentials, createConnectLink } = await import('@/app/actions/connect');
const { listManifests } = await import('@/lib/providers/core/manifests');

// A real key-based provider, so the declared fields are the ones the page shows.
const keyProvider = listManifests({ enabledOnly: false }).find((manifest) => manifest.auth.type !== 'OAUTH2')!;
const oauthProvider = listManifests({ enabledOnly: false }).find((manifest) => manifest.auth.type === 'OAUTH2')!;

const fields = keyProvider.auth.type !== 'OAUTH2' ? keyProvider.auth.fields : [];

function filledForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const field of fields) form.set(field.key, `value-for-${field.key}`);
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

beforeEach(() => {
  state.session = { id: 'session-1', clientId: 'client-1', provider: null };
  state.sessionState = 'ok';
  state.created = [];
  state.deleted = [];
  state.claimed = true;
  state.events = [];
  state.createdSessions = [];
  state.signed = true;
  state.signedIn = true;
});

describe('a session that may not be used', () => {
  it.each([
    ['invalid', /not valid/i],
    ['expired', /expired/i],
    ['used', /already used/i],
  ] as const)('refuses a %s link, and says so in its own words', async (sessionState, message) => {
    state.sessionState = sessionState;

    const result = await submitConnectCredentials('token', keyProvider.slug, filledForm());

    expect(result.error).toMatch(message);
    expect(state.created).toHaveLength(0);
  });
});

describe('which service', () => {
  it('refuses a service this deployment does not have', async () => {
    const result = await submitConnectCredentials('token', 'NOT_A_PROVIDER', filledForm());

    expect(result.error).toBeTruthy();
    expect(state.created).toHaveLength(0);
  });

  /**
   * The provider arrives from the browser, so a session created for one service
   * must not be talked into connecting another. A product that pinned RD
   * Station is telling its customer what they are about to authorize.
   */
  it('refuses a service the session was not created for', async () => {
    state.session!.provider = oauthProvider.slug;

    const result = await submitConnectCredentials('token', keyProvider.slug, filledForm());

    expect(result.error).toBeTruthy();
    expect(state.created).toHaveLength(0);
  });

  it('refuses a service that signs in through its own window', async () => {
    const result = await submitConnectCredentials('token', oauthProvider.slug, new FormData());

    expect(result.error).toMatch(/sign-in window/i);
    expect(state.created).toHaveLength(0);
  });
});

describe('the fields', () => {
  it('names the field that is missing', async () => {
    const required = fields.find((field) => field.required)!;
    const form = filledForm();
    form.delete(required.key);

    const result = await submitConnectCredentials('token', keyProvider.slug, form);

    expect(result.error).toContain(required.label);
    expect(state.created).toHaveLength(0);
  });

  it('treats blank as missing', async () => {
    const required = fields.find((field) => field.required)!;

    const result = await submitConnectCredentials('token', keyProvider.slug, filledForm({ [required.key]: '   ' }));

    expect(result.error).toContain(required.label);
  });
});

describe('a connection that works', () => {
  it('lands under the client the session names, never one the form names', async () => {
    const form = filledForm();
    // The attack: a form field that looks like the dashboard action's.
    form.set('clientId', 'client-somebody-else');

    const result = await submitConnectCredentials('token', keyProvider.slug, form);

    expect(result.error).toBeUndefined();
    expect(state.created[0].clientId).toBe('client-1');
  });

  it('accepts a lowercase slug, as the page sends it', async () => {
    const result = await submitConnectCredentials('token', keyProvider.slug.toLowerCase(), filledForm());

    expect(result.connectionId).toBeTruthy();
    expect(state.created[0].provider).toBe(keyProvider.slug);
  });

  it('announces the connection so the product hears without polling', async () => {
    const result = await submitConnectCredentials('token', keyProvider.slug, filledForm());

    expect(state.events).toEqual([
      { eventType: 'connection.connected', linkedAccountId: result.connectionId },
    ]);
  });
});

describe('two tabs, one link', () => {
  /**
   * The row is claimed after the account exists, so the loser of the race has
   * already written one. Leaving it behind would attach an account nobody asked
   * for to a client whose console never shows where it came from.
   */
  it('removes the account it just made when the session was already claimed', async () => {
    state.claimed = false;

    const result = await submitConnectCredentials('token', keyProvider.slug, filledForm());

    expect(result.error).toMatch(/already used/i);
    expect(state.deleted).toEqual([state.created[0].id]);
    expect(state.events).toHaveLength(0);
  });
});

describe('a link made from the console', () => {
  const linkForm = (overrides: Record<string, string> = {}) => {
    const form = new FormData();
    form.set('clientId', 'client-1');
    for (const [key, value] of Object.entries(overrides)) form.set(key, value);
    return form;
  };

  it('needs a console session, like everything else in the dashboard', async () => {
    state.signedIn = false;

    await expect(createConnectLink(linkForm())).rejects.toThrow();
    expect(state.createdSessions).toHaveLength(0);
  });

  it('answers with the link', async () => {
    const result = await createConnectLink(linkForm());

    expect(result.url).toBe('https://app.test/connect/tok');
    expect(state.createdSessions[0].clientId).toBe('client-1');
  });

  it('refuses a client that is not there', async () => {
    const result = await createConnectLink(linkForm({ clientId: 'client-gone' }));

    expect(result.error).toBeTruthy();
    expect(state.createdSessions).toHaveLength(0);
  });

  it('says so rather than minting something unsigned', async () => {
    state.signed = false;

    expect((await createConnectLink(linkForm())).error).toMatch(/DASHBOARD_SESSION_SECRET/);
    expect(state.createdSessions).toHaveLength(0);
  });

  it('normalizes the service to its slug, and refuses one that does not exist', async () => {
    await createConnectLink(linkForm({ provider: keyProvider.slug.toLowerCase() }));
    expect(state.createdSessions[0].provider).toBe(keyProvider.slug);

    expect((await createConnectLink(linkForm({ provider: 'NOPE' }))).error).toBeTruthy();
    expect(state.createdSessions).toHaveLength(1);
  });

  // An origin typed here ends up in a frame-ancestors header, and a return URL
  // is somewhere a customer's browser is sent.
  it('refuses an origin or a return URL that is not a safe absolute URL', async () => {
    expect((await createConnectLink(linkForm({ origin: 'javascript:alert(1)' }))).error).toBeTruthy();
    expect((await createConnectLink(linkForm({ redirectUrl: 'http://not-localhost.example' }))).error).toBeTruthy();
    expect(state.createdSessions).toHaveLength(0);
  });

  it('keeps only the origin of what was typed in the embed field', async () => {
    await createConnectLink(linkForm({ origin: 'https://your-app.com/settings/integrations' }));

    expect(state.createdSessions[0].origins).toEqual(['https://your-app.com']);
  });
});
