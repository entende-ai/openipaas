import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The client the console is looking at.
 *
 * It is a view preference, not a boundary: everyone signed in can already see
 * every client. What has to hold is that a stale selection cannot leave the
 * console showing nothing with no explanation, and that the scope it produces
 * is either one client or all of them, never something in between.
 */

const state = vi.hoisted(() => ({
  clients: [] as { id: string; name: string }[],
  cookie: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (state.cookie ? { name, value: state.cookie } : undefined) }),
}));

vi.mock('@/lib/prisma', () => ({
  default: { client: { findMany: async () => state.clients } },
}));

const { currentWorkspace, scopeTo } = await import('@/lib/dashboard/workspace');

beforeEach(() => {
  state.clients = [
    { id: 'client-1', name: 'LadiGroup' },
    { id: 'client-2', name: 'Outra Empresa' },
  ];
  state.cookie = undefined;
});

describe('the current client', () => {
  it('is all of them until one is picked', async () => {
    const workspace = await currentWorkspace();

    expect(workspace.clientId).toBeNull();
    expect(workspace.name).toBeNull();
    expect(workspace.clients).toHaveLength(2);
  });

  it('is the one the cookie names', async () => {
    state.cookie = 'client-2';

    const workspace = await currentWorkspace();

    expect(workspace.clientId).toBe('client-2');
    expect(workspace.name).toBe('Outra Empresa');
  });

  // A client can be deleted while somebody has it selected in another tab. The
  // console must fall back to something rather than filter everything away.
  it('falls back to all of them when the selection no longer exists', async () => {
    state.cookie = 'client-gone';

    const workspace = await currentWorkspace();

    expect(workspace.clientId).toBeNull();
    expect(workspace.clients).toHaveLength(2);
  });

  it('offers every client to switch to, whichever is selected', async () => {
    state.cookie = 'client-1';

    expect((await currentWorkspace()).clients.map((client) => client.id)).toEqual(['client-1', 'client-2']);
  });
});

describe('what a query is scoped to', () => {
  it('names one client, or nothing at all', () => {
    expect(scopeTo('client-1')).toEqual({ clientId: 'client-1' });
    expect(scopeTo(null)).toEqual({});
  });
});
