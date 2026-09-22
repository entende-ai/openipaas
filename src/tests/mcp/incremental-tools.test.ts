import { describe, it, expect } from 'vitest';
import type { ProviderContext, ProviderManifest, UnifiedProvider } from '@/lib/providers/core/types';
import { dispatch, type McpContext, type McpConnection } from '@/lib/mcp/server';

/**
 * What an agent is offered, and what it is refused, when following up on a list.
 *
 * A model reads the argument list and uses what is there. Offering updatedAfter
 * on a provider that ignores it would have the model believe a full table is a
 * delta, so the argument only exists where the filter does.
 */

function manifestWith(incremental?: string[]): ProviderManifest {
  return {
    slug: 'FAKE',
    name: 'Fake CRM',
    category: 'CRM',
    description: 'Only in this test.',
    baseUrl: 'https://api.example.com',
    auth: { type: 'API_KEY', fields: [] },
    capabilities: { contacts: ['list'], deals: ['list'] },
    ...(incremental ? { incremental } : {}),
    passthrough: false,
    enabled: true,
  } as unknown as ProviderManifest;
}

const calls: string[] = [];

function context(manifest: ProviderManifest): McpContext {
  const connection: McpConnection = {
    provider: {
      manifest,
      listContacts: async (_ctx: unknown, params: { updatedAfter?: string }) => {
        calls.push(`listContacts:${params.updatedAfter ?? 'all'}`);
        return { items: [], hasMore: false, nextCursor: null };
      },
      listDeals: async () => {
        calls.push('listDeals');
        return { items: [], hasMore: false, nextCursor: null };
      },
    } as unknown as UnifiedProvider,
    credentials: { accessToken: 'at' } as unknown as ProviderContext,
    prefix: '',
    label: 'Fake CRM',
  };

  return { requestId: 'req-1', clientName: 'LadiGroup', scope: 'connection', connections: [connection], keyScopes: [] };
}

const rpc = (method: string, params?: Record<string, unknown>) =>
  ({ jsonrpc: '2.0' as const, id: 1, method, params });

async function schemaOf(manifest: ProviderManifest, tool: string) {
  const answer = (await dispatch(rpc('tools/list'), context(manifest))) as {
    result: { tools: { name: string; inputSchema: { properties: Record<string, unknown> } }[] };
  };
  return answer.result.tools.find((entry) => entry.name === tool)?.inputSchema.properties ?? {};
}

describe('the list tools an agent sees', () => {
  it('offers updatedAfter only on the resources the provider can filter', async () => {
    const manifest = manifestWith(['contacts']);

    expect(await schemaOf(manifest, 'list_contacts')).toHaveProperty('updatedAfter');
    expect(await schemaOf(manifest, 'list_deals')).not.toHaveProperty('updatedAfter');
  });

  it('offers it nowhere when the provider declares nothing', async () => {
    expect(await schemaOf(manifestWith(), 'list_contacts')).not.toHaveProperty('updatedAfter');
  });
});

describe('calling with it anyway', () => {
  it('passes it through where it works', async () => {
    calls.length = 0;

    await dispatch(
      rpc('tools/call', { name: 'list_contacts', arguments: { updatedAfter: '2026-09-01T00:00:00Z' } }),
      context(manifestWith(['contacts']))
    );

    expect(calls).toEqual(['listContacts:2026-09-01T00:00:00Z']);
  });

  // A model can send an argument it was never offered. The provider would
  // ignore it and answer with everything, which is the wrong answer wearing the
  // right shape.
  it('is refused where the provider would have ignored it', async () => {
    calls.length = 0;

    const answer = (await dispatch(
      rpc('tools/call', { name: 'list_deals', arguments: { updatedAfter: '2026-09-01T00:00:00Z' } }),
      context(manifestWith(['contacts']))
    )) as { result: { isError: boolean; content: { text: string }[] } };

    expect(answer.result.isError).toBe(true);
    expect(answer.result.content[0].text).toContain('NOT_SUPPORTED');
    expect(answer.result.content[0].text).toContain('contacts');
    expect(calls).toHaveLength(0);
  });

  it('leaves a plain list call alone', async () => {
    calls.length = 0;

    await dispatch(rpc('tools/call', { name: 'list_deals', arguments: {} }), context(manifestWith(['contacts'])));

    expect(calls).toEqual(['listDeals']);
  });
});
