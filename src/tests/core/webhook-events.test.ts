import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The events a client is told about.
 *
 * The machinery (signing, retries) was already here and tested; what was
 * missing was anything emitting. These tests cover the part that decides
 * whether a subscriber hears about a connection, and how often.
 */

const state = vi.hoisted(() => ({
  endpoints: [] as { id: string; clientId: string; active: boolean; events: string[] }[],
  recent: [] as { endpointId: string }[],
  created: [] as { endpointId: string; eventType: string; payload: Record<string, unknown> }[],
  account: null as null | { id: string; clientId: string; provider: string; label: string | null },
  recentQuery: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    webhookEndpoint: {
      findMany: async ({ where }: { where: { clientId: string; events: { has: string } } }) =>
        state.endpoints.filter(
          (endpoint) =>
            endpoint.clientId === where.clientId && endpoint.active && endpoint.events.includes(where.events.has)
        ),
    },
    webhookDelivery: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        // Two callers: the deduplication lookup, which filters on the payload,
        // and the delivery queue, which the emitter kicks and does not await.
        if (!('payload' in where)) return [];

        state.recentQuery = where;
        return state.recent;
      },
      createMany: async ({ data }: { data: typeof state.created }) => {
        state.created.push(...data);
        return { count: data.length };
      },
    },
    linkedAccount: {
      findUnique: async () => state.account,
    },
  },
}));

const { emit, emitConnectionEvent, EVENT_TYPES, isEventType, EXPIRY_DEDUPE_MS } = await import('@/lib/webhooks');

beforeEach(() => {
  state.endpoints = [{ id: 'ep-1', clientId: 'client-1', active: true, events: [...EVENT_TYPES] }];
  state.recent = [];
  state.created = [];
  state.recentQuery = null;
  state.account = { id: 'acc-1', clientId: 'client-1', provider: 'RD_STATION_CRM', label: 'RD da Ladi' };
});

describe('the event list', () => {
  // Offering an event nothing emits means a subscriber waits forever for it.
  it('is only what is actually emitted', () => {
    expect(EVENT_TYPES).toEqual(['connection.connected', 'connection.expired', 'connection.disconnected']);
    expect(isEventType('customer.created')).toBe(false);
  });
});

describe('a connection event', () => {
  it('names the connection in the words the API uses elsewhere', async () => {
    await emitConnectionEvent({ eventType: 'connection.connected', linkedAccountId: 'acc-1' });

    expect(state.created).toHaveLength(1);
    expect(state.created[0].payload).toMatchObject({
      connectionId: 'acc-1',
      service: 'RD_STATION_CRM',
      serviceName: 'RD Station CRM',
      label: 'RD da Ladi',
    });
  });

  it('carries why, when there is a why', async () => {
    await emitConnectionEvent({ eventType: 'connection.expired', linkedAccountId: 'acc-1', reason: 'session expired' });

    expect(state.created[0].payload.reason).toBe('session expired');
  });

  it('says nothing about a connection that is gone', async () => {
    state.account = null;

    expect(await emitConnectionEvent({ eventType: 'connection.disconnected', linkedAccountId: 'acc-1' })).toBe(0);
    expect(state.created).toHaveLength(0);
  });

  it('skips an endpoint that did not ask for that event', async () => {
    state.endpoints = [{ id: 'ep-1', clientId: 'client-1', active: true, events: ['connection.disconnected'] }];

    expect(await emitConnectionEvent({ eventType: 'connection.expired', linkedAccountId: 'acc-1' })).toBe(0);
  });
});

describe('an expiry that keeps happening', () => {
  // A broken connection fails on every request. One event per failure would be
  // a flood the subscriber has to deduplicate at the rate we are being called.
  it('is sent once per endpoint per window', async () => {
    state.recent = [{ endpointId: 'ep-1' }];

    const queued = await emitConnectionEvent({ eventType: 'connection.expired', linkedAccountId: 'acc-1' });

    expect(queued).toBe(0);
    expect(state.created).toHaveLength(0);
    expect(state.recentQuery).toMatchObject({
      eventType: 'connection.expired',
      payload: { path: ['connectionId'], equals: 'acc-1' },
    });
  });

  it('reaches an endpoint that has not had it yet', async () => {
    state.endpoints.push({ id: 'ep-2', clientId: 'client-1', active: true, events: [...EVENT_TYPES] });
    state.recent = [{ endpointId: 'ep-1' }];

    const queued = await emitConnectionEvent({ eventType: 'connection.expired', linkedAccountId: 'acc-1' });

    expect(queued).toBe(1);
    expect(state.created[0].endpointId).toBe('ep-2');
  });

  // Connecting again is the thing the subscriber is waiting for, so it must
  // never be collapsed into a previous one.
  it('does not deduplicate the other events', async () => {
    state.recent = [{ endpointId: 'ep-1' }];

    await emitConnectionEvent({ eventType: 'connection.connected', linkedAccountId: 'acc-1' });

    expect(state.created).toHaveLength(1);
    expect(state.recentQuery).toBeNull();
  });

  it('holds the window at an hour', () => {
    expect(EXPIRY_DEDUPE_MS).toBe(60 * 60 * 1000);
  });
});

describe('emit on its own', () => {
  it('answers zero when the client has no endpoint', async () => {
    state.endpoints = [];

    expect(await emit({ clientId: 'client-1', eventType: 'connection.connected', payload: {} })).toBe(0);
  });

  it('never crosses into another client', async () => {
    state.endpoints = [{ id: 'ep-other', clientId: 'client-2', active: true, events: [...EVENT_TYPES] }];

    expect(await emit({ clientId: 'client-1', eventType: 'connection.connected', payload: {} })).toBe(0);
  });
});
