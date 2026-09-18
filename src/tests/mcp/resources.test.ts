import { describe, it, expect } from 'vitest';
import type { ProviderContext, ProviderManifest, UnifiedProvider } from '@/lib/providers/core/types';
import { dispatch, type McpContext } from '@/lib/mcp/server';
import { GUIDE_URI, CAPABILITIES_URI, OPENAPI_URI, providerUri, resourcesFor, readResource } from '@/lib/mcp/resources';
import { getManifest } from '@/lib/providers/core/registry';

/**
 * The documentation this server hands a model.
 *
 * It is generated from the connected account's manifest, so what these tests
 * hold in place is that it stays true of whatever provider is on the other end:
 * a provider with no passthrough is not told about passthrough, a provider that
 * gains a capability gains the line describing it, and nothing here mentions a
 * provider by name in code.
 */

function manifestWith(overrides: Partial<ProviderManifest>): ProviderManifest {
  return {
    slug: 'FAKE',
    name: 'Fake CRM',
    category: 'CRM',
    description: 'A provider that exists only in this test.',
    docsUrl: 'https://example.com/docs',
    baseUrl: 'https://api.example.com/v1',
    auth: { type: 'API_KEY', fields: [{ key: 'token', label: 'Token' }] },
    rateLimit: { requestsPerSecond: 2, burst: 5 },
    capabilities: {},
    passthrough: false,
    enabled: true,
    ...overrides,
  } as ProviderManifest;
}

function contextFor(manifest: ProviderManifest): McpContext {
  return {
    requestId: 'req-1',
    clientName: 'LadiGroup',
    scope: 'connection',
    connections: [
      {
        provider: { manifest } as unknown as UnifiedProvider,
        credentials: { accessToken: 'at' } as unknown as ProviderContext,
        prefix: '',
        label: manifest.name,
      },
    ],
  };
}

const rpc = (method: string, params?: Record<string, unknown>) =>
  ({ jsonrpc: '2.0' as const, id: 1, method, params });

const read = (uri: string, manifest: ProviderManifest) => readResource(uri, contextFor(manifest))!;

describe('what the connection serves', () => {
  it('lists the guide, the matrix, the provider notes and the spec', async () => {
    const manifest = manifestWith({ capabilities: { contacts: ['list'] } });
    const response = await dispatch(rpc('resources/list'), contextFor(manifest));

    const uris = (response.result as { resources: { uri: string }[] }).resources.map((entry) => entry.uri);
    expect(uris).toEqual([GUIDE_URI, CAPABILITIES_URI, providerUri('FAKE'), OPENAPI_URI]);
  });

  it('declares the capability, or a client never asks', async () => {
    const response = await dispatch(rpc('initialize', {}), contextFor(manifestWith({})));
    const { capabilities, instructions } = response.result as {
      capabilities: Record<string, unknown>;
      instructions: string;
    };

    expect(capabilities.resources).toEqual({ listChanged: false, subscribe: false });
    // A model that is never told the guide exists does not read it.
    expect(instructions).toContain(GUIDE_URI);
  });

  it('answers the template list rather than looking broken', async () => {
    const response = await dispatch(rpc('resources/templates/list'), contextFor(manifestWith({})));
    expect(response.result).toEqual({ resourceTemplates: [] });
  });

  it('reads one back with its uri and type', async () => {
    const response = await dispatch(rpc('resources/read', { uri: GUIDE_URI }), contextFor(manifestWith({})));
    const { contents } = response.result as { contents: { uri: string; mimeType: string; text: string }[] };

    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({ uri: GUIDE_URI, mimeType: 'text/markdown' });
    expect(contents[0].text).toContain('Fake CRM');
  });

  it('says what it does not have, and how to find out what it does', async () => {
    const response = await dispatch(rpc('resources/read', { uri: 'openipaas://invented' }), contextFor(manifestWith({})));

    expect(response.error?.message).toContain('resources/list');
  });

  it('refuses a read with no uri', async () => {
    const response = await dispatch(rpc('resources/read', {}), contextFor(manifestWith({})));
    expect(response.error?.message).toContain('requires a uri');
  });
});

describe('the guide', () => {
  it('names the client it is acting for, so the model knows whose data this is', () => {
    expect(read(GUIDE_URI, manifestWith({})).text).toContain('LadiGroup');
  });

  it('teaches the paging that is easy to get wrong', () => {
    const text = read(GUIDE_URI, manifestWith({ capabilities: { contacts: ['list'] } })).text;

    expect(text).toContain('nextCursor');
    expect(text).toContain('hasMore');
    // Absent, not null, is the one that produces a wrong answer silently.
    expect(text).toMatch(/`totalItems` is \*\*absent\*\*, not null/);
  });

  it('lists the resources this account actually has', () => {
    const text = read(GUIDE_URI, manifestWith({ capabilities: { contacts: ['list'], deals: ['list'] } })).text;

    expect(text).toContain('contacts, deals');
    expect(text).not.toContain('products');
  });

  it('does not describe passthrough to a provider that has none', () => {
    expect(read(GUIDE_URI, manifestWith({ passthrough: false })).text).not.toContain('## Passthrough');
    expect(read(GUIDE_URI, manifestWith({ passthrough: true })).text).toContain('## Passthrough');
  });

  it('hands over the paths that provider offers, when it offers any', () => {
    const text = read(
      GUIDE_URI,
      manifestWith({ passthrough: true, passthroughExamples: [{ path: '/tasks', label: 'tasks on a deal' }] })
    ).text;

    expect(text).toContain('/tasks');
    expect(text).toContain('tasks on a deal');
  });

  it('counts the tools the account really has', () => {
    expect(read(GUIDE_URI, manifestWith({ capabilities: { contacts: ['list', 'get'] } })).text).toContain('2 tools');
    expect(read(GUIDE_URI, manifestWith({ capabilities: { contacts: ['list'] } })).text).toContain('1 tool');
  });
});

describe('the matrix', () => {
  it('pairs every operation with the tool that serves it', () => {
    const payload = JSON.parse(read(CAPABILITIES_URI, manifestWith({ capabilities: { contacts: ['list', 'upsert'] } })).text);

    expect(payload.resources).toEqual([
      {
        resource: 'contacts',
        operations: [
          { operation: 'list', tool: 'list_contacts' },
          { operation: 'upsert', tool: 'upsert_contact' },
        ],
      },
    ]);
  });

  it('is json a model can branch on, not prose', () => {
    const resource = resourcesFor(contextFor(manifestWith({}))).find((entry) => entry.uri === CAPABILITIES_URI)!;
    expect(resource.mimeType).toBe('application/json');
    expect(() => JSON.parse(read(CAPABILITIES_URI, manifestWith({})).text)).not.toThrow();
  });
});

describe('the provider notes', () => {
  it('carry the limits and the upstream documentation', () => {
    const text = read(providerUri('FAKE'), manifestWith({})).text;

    expect(text).toContain('https://example.com/docs');
    expect(text).toContain('2 requests per second');
    expect(text).toContain('bursting to 5');
    // A model that thinks it holds a provider token will try to use it.
    expect(text).toContain('You never see a provider token');
  });

  it('say plainly when there is no raw api to fall back to', () => {
    expect(read(providerUri('FAKE'), manifestWith({ passthrough: false })).text).toContain('no passthrough');
  });
});

describe('the specification', () => {
  it('is the same document the http api publishes', () => {
    const spec = JSON.parse(read(OPENAPI_URI, manifestWith({})).text);

    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });
});

describe('against a provider that really exists', () => {
  it('describes RD Station CRM from its own manifest, with nothing hardcoded', () => {
    const manifest = getManifest('RD_STATION_CRM')!;
    const text = read(GUIDE_URI, manifest).text;
    const payload = JSON.parse(read(CAPABILITIES_URI, manifest).text);

    expect(text).toContain(manifest.name);
    expect(payload.provider.slug).toBe('RD_STATION_CRM');
    for (const resource of Object.keys(manifest.capabilities)) {
      expect(text).toContain(resource);
    }
  });
});
