import { describe, it, expect } from 'vitest';
import { RdStationCrmProvider } from '@/lib/providers/implementations/rdstationcrm/provider';
import { rdStationCrmManifest } from '@/lib/providers/implementations/rdstationcrm/manifest';
import { connectionOffer } from '@/lib/providers/core/manifests';
import { makeContext, stubFetch, noSleep } from '../helpers';

// The shared contract suite checks the manifest and capability wiring. This
// file covers what is specific to RD Station CRM.

const ctx = makeContext({ provider: 'RD_STATION_CRM', accessToken: 'live-token' });

function provider(responses: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(responses);
  return { stub, sut: new RdStationCrmProvider({ fetchImpl: stub.fetch, sleep: noSleep }) };
}

describe('RdStationCrmProvider passthrough', () => {
  it('reaches the CRM v2 API with the bearer token', async () => {
    const { stub, sut } = provider([{ json: { data: [] } }]);

    await sut.passthrough(ctx, { method: 'GET', path: '/contacts' });

    expect(stub.calls[0].url).toBe('https://api.rd.services/crm/v2/contacts');
    expect(stub.calls[0].auth).toBe('Bearer live-token');
  });

  it('carries the JSON:API pagination parameters through', async () => {
    const { stub, sut } = provider([{ json: { data: [] } }]);

    await sut.passthrough(ctx, {
      method: 'GET',
      path: '/deals',
      query: { 'page[number]': '2', 'page[size]': '50' },
    });

    // Brackets are percent-encoded on the wire, which servers decode back.
    const url = new URL(stub.calls[0].url);
    expect(url.pathname).toBe('/crm/v2/deals');
    expect(url.searchParams.get('page[number]')).toBe('2');
    expect(url.searchParams.get('page[size]')).toBe('50');
  });

  it('forwards a write body', async () => {
    const { stub, sut } = provider([{ json: { data: { id: 'c-1' } } }]);

    await sut.passthrough(ctx, { method: 'POST', path: '/contacts', body: { data: { name: 'Bili' } } });

    expect(stub.calls[0].method).toBe('POST');
    expect(stub.calls[0].body).toEqual({ data: { name: 'Bili' } });
  });
});

describe('RdStationCrmProvider manifest', () => {
  it('throttles to the documented 120 requests per minute', () => {
    expect(rdStationCrmManifest.rateLimit!.requestsPerSecond * 60).toBe(120);
  });

  it('sends client credentials in the token request body, as RD documents', () => {
    expect(rdStationCrmManifest.auth).toMatchObject({ type: 'OAUTH2', tokenEndpointAuth: 'body' });
  });

  it('is offered in the connect dialog as passthrough only', () => {
    // No unified CRM resources yet, so passthrough is all a connection gives.
    expect(connectionOffer(rdStationCrmManifest)).toEqual({ connectable: true, note: 'passthrough only' });
  });
});
