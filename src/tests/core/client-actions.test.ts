import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Creating and renaming a client, with Prisma and the session stubbed.
 *
 * A client's name is the only field on that screen written for people rather
 * than for machines, and it was set once at creation and then frozen. These
 * tests are about the rules around changing it.
 */

type Client = { id: string; name: string };

const state = vi.hoisted(() => ({
  clients: [] as Client[],
  session: { id: 'user-1', email: 'owner@example.com', name: null, role: 'OWNER' },
  updates: [] as { id: string; data: Record<string, unknown> }[],
  revalidated: [] as string[],
  keys: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.clients.find((client) => client.id === where.id) ?? null,
      create: async ({ data }: { data: { name: string } }) => {
        const client = { id: `client-${state.clients.length + 1}`, ...data };
        state.clients.push(client);
        return client;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updates.push({ id: where.id, data });
        const client = state.clients.find((entry) => entry.id === where.id);
        if (client) Object.assign(client, data);
        return client;
      },
    },
    apiKey: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.keys.push(data);
        return data;
      },
      update: async () => ({}),
      findUnique: async () => null,
    },
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: (path: string) => state.revalidated.push(path) }));

vi.mock('@/lib/auth-session', () => ({
  requireDashboardSession: async () => state.session,
  requireOwner: async () => state.session,
}));

const { createClient, renameClient, generateApiKey } = await import('@/app/actions/client');

function form(name: string): FormData {
  const data = new FormData();
  data.set('name', name);
  return data;
}

beforeEach(() => {
  state.clients = [{ id: 'client-1', name: 'Ladigroup' }];
  state.updates = [];
  state.revalidated = [];
  state.keys = [];
});

describe('creating a client', () => {
  it('trims the name', async () => {
    expect(await createClient(form('  Acme Corp  '))).toMatchObject({ success: true });
    expect(state.clients.at(-1)!.name).toBe('Acme Corp');
  });

  // The dialog used to close on failure, so a rejected name looked like success.
  it('refuses an empty name and says so', async () => {
    expect(await createClient(form('   '))).toMatchObject({ error: expect.stringContaining('required') });
    expect(state.clients).toHaveLength(1);
  });

  it('refuses a name too long to render anywhere', async () => {
    expect(await createClient(form('x'.repeat(121)))).toMatchObject({ error: expect.stringContaining('under 120') });
  });
});

describe('renaming a client', () => {
  it('changes the name', async () => {
    expect(await renameClient('client-1', form('LadiGroup Brasil'))).toMatchObject({ success: true });
    expect(state.clients[0].name).toBe('LadiGroup Brasil');
  });

  // The connections page prints the client's name next to every account.
  it('refreshes both screens that show the name', async () => {
    await renameClient('client-1', form('LadiGroup Brasil'));
    expect(state.revalidated).toContain('/dashboard/clients');
    expect(state.revalidated).toContain('/dashboard/linked-accounts');
  });

  it('writes nothing when the name did not change', async () => {
    expect(await renameClient('client-1', form(' Ladigroup '))).toMatchObject({ success: true });
    expect(state.updates).toEqual([]);
  });

  it('applies the same rules as creating', async () => {
    expect(await renameClient('client-1', form(''))).toMatchObject({ error: expect.stringContaining('required') });
    expect(await renameClient('client-1', form('x'.repeat(121)))).toMatchObject({
      error: expect.stringContaining('under 120'),
    });
    expect(state.updates).toEqual([]);
  });

  it('answers the same way for an id that is not there', async () => {
    expect(await renameClient('client-404', form('Whatever'))).toMatchObject({
      error: expect.stringContaining('no longer exists'),
    });
  });
});

describe('issuing an api key', () => {
  it('shows the key once and stores only a hash of it', async () => {
    const result = await generateApiKey('client-1', 'AI agent');

    expect(result.apiKey).toMatch(/^oip_/);
    expect(state.keys).toHaveLength(1);
    expect(JSON.stringify(state.keys[0])).not.toContain(result.apiKey);
    expect(state.keys[0].keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // Several keys per client is the point: revoke the agent without stopping the
  // backend. The name is the only way to tell them apart afterwards.
  it('adds a key rather than replacing the last one, and keeps the name', async () => {
    await generateApiKey('client-1', 'backend');
    await generateApiKey('client-1', '  AI agent  ');

    expect(state.keys.map((key) => key.name)).toEqual(['backend', 'AI agent']);
  });

  it('accepts no name at all', async () => {
    await generateApiKey('client-1');
    await generateApiKey('client-1', '   ');

    expect(state.keys.map((key) => key.name)).toEqual([null, null]);
  });
});
