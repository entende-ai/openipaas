import { describe, it, expect } from 'vitest';
import { describeConnections } from '@/lib/connections-view';

/**
 * The listing a client gets of its own connections.
 *
 * What matters here is that it stays honest about connections that do not work.
 * A screen that hides a dead credential is worse than no screen: the operator
 * finds out from a customer.
 */

const NOW = new Date('2026-09-22T12:00:00Z');

function account(over: Partial<Parameters<typeof describeConnections>[0]['accounts'][number]> = {}) {
  return {
    id: 'acc-1',
    clientId: 'client-1',
    provider: 'RD_STATION_CRM',
    accountToken: 'tok-1',
    label: 'RD Station CRM',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    credentials: [credential()],
    ...over,
  } as Parameters<typeof describeConnections>[0]['accounts'][number];
}

function credential(over: Record<string, unknown> = {}) {
  return {
    id: 'cred-1',
    linkedAccountId: 'acc-1',
    accessToken: 'enc',
    refreshToken: 'enc',
    expiresAt: new Date('2026-09-22T14:00:00Z'),
    scope: null,
    tokenType: 'Bearer',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    revokedAt: null,
    ...over,
  } as never;
}

describe('a client listing its connections', () => {
  it('names the service, which is what X-Provider takes', () => {
    const [view] = describeConnections({ accounts: [account()], now: NOW });

    expect(view.service).toBe('RD_STATION_CRM');
    expect(view.serviceName).toBe('RD Station CRM');
    expect(view.status).toBe('active');
  });

  it('carries the token that pins this exact connection', () => {
    const [view] = describeConnections({ accounts: [account({ accountToken: 'tok-abc' })], now: NOW });
    expect(view.connectionToken).toBe('tok-abc');
  });

  // The whole point of the endpoint: a broken connection has to be visible.
  it('reports a connection with no credential rather than dropping it', () => {
    const [view] = describeConnections({ accounts: [account({ credentials: [] })], now: NOW });

    expect(view.status).toBe('missing');
    expect(view.needsAttention).toBe(true);
    expect(view.agentToolPrefix).toBeNull();
  });

  it('separates an expired token that renews itself from one that cannot', () => {
    const dead = new Date('2026-09-22T11:00:00Z');

    const [renewing] = describeConnections({
      accounts: [account({ credentials: [credential({ expiresAt: dead })] })],
      now: NOW,
    });
    const [expired] = describeConnections({
      accounts: [account({ credentials: [credential({ expiresAt: dead, refreshToken: null })] })],
      now: NOW,
    });

    expect(renewing.status).toBe('stale');
    expect(renewing.needsAttention).toBe(false);
    expect(expired.status).toBe('expired');
    expect(expired.needsAttention).toBe(true);
  });

  // A provider removed from a fork leaves rows behind. Saying "connected" about
  // one would be a lie the caller cannot check.
  it('marks a provider the registry no longer has as unavailable', () => {
    const [view] = describeConnections({ accounts: [account({ provider: 'SOMETHING_GONE' })], now: NOW });

    expect(view.status).toBe('unavailable');
    expect(view.capabilities).toEqual({});
    expect(view.agentToolPrefix).toBeNull();
  });

  it('gives the same tool prefixes an agent will see, id fragment and all', () => {
    const views = describeConnections({
      accounts: [
        account({ id: 'a', accountToken: 'tok-a' }),
        account({ id: 'b', accountToken: 'tok-b', credentials: [credential({ id: 'cred-2' })] }),
        account({ id: 'c', provider: 'CONTA_AZUL', accountToken: 'tok-c', label: 'Conta Azul' }),
      ],
      now: NOW,
    });

    const [a, b, c] = views;
    expect(c.agentToolPrefix).toBe('conta_azul__');
    // Two accounts on one service: the prefixes must differ, or a tool call
    // would reach whichever the server happened to match first.
    expect(a.agentToolPrefix).not.toBe(b.agentToolPrefix);
    expect(a.agentToolPrefix?.startsWith('rd_station_crm')).toBe(true);
  });

  it('reports when a connection was last reached, and null when never', () => {
    const views = describeConnections({
      accounts: [account({ id: 'a', accountToken: 'tok-a' }), account({ id: 'b', accountToken: 'tok-b' })],
      lastUsedAt: new Map([['a', new Date('2026-09-20T08:30:00Z')]]),
      now: NOW,
    });

    expect(views[0].lastUsedAt).toBe('2026-09-20T08:30:00.000Z');
    expect(views[1].lastUsedAt).toBeNull();
  });
});
