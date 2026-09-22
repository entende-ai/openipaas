import { describe, it, expect, vi } from 'vitest';
import type { ProviderContext, ProviderManifest, UnifiedProvider } from '@/lib/providers/core/types';
import { dispatch, type McpContext, type McpConnection } from '@/lib/mcp/server';

/**
 * An agent holding a scoped key.
 *
 * The point of scoping a key is to be able to hand one to a model. A model
 * works from the list it is given, so the list has to be the truth: a tool it
 * must not call should not be offered, and calling one anyway has to fail
 * before the provider is reached.
 */

const manifest = {
  slug: 'RD_STATION_CRM',
  name: 'RD Station CRM',
  category: 'CRM',
  description: 'Test manifest.',
  baseUrl: 'https://api.example.com',
  auth: { type: 'API_KEY', fields: [] },
  capabilities: { contacts: ['list', 'create'], deals: ['list'] },
  passthrough: true,
  enabled: true,
} as unknown as ProviderManifest;

const calls: string[] = [];

function context(keyScopes: string[]): McpContext {
  const connection: McpConnection = {
    provider: {
      manifest,
      listContacts: async () => {
        calls.push('listContacts');
        return { items: [], hasMore: false, nextCursor: null };
      },
      createContact: async () => {
        calls.push('createContact');
        return { id: 'c1' };
      },
      passthrough: async () => {
        calls.push('passthrough');
        return { status: 200, body: {} };
      },
    } as unknown as UnifiedProvider,
    credentials: { accessToken: 'at' } as unknown as ProviderContext,
    prefix: '',
    label: 'RD Station CRM',
  };

  return { requestId: 'req-1', clientName: 'LadiGroup', scope: 'connection', connections: [connection], keyScopes };
}

const rpc = (method: string, params?: Record<string, unknown>) =>
  ({ jsonrpc: '2.0' as const, id: 1, method, params });

async function toolNames(keyScopes: string[]) {
  const answer = (await dispatch(rpc('tools/list'), context(keyScopes))) as { result: { tools: { name: string }[] } };
  return answer.result.tools.map((tool) => tool.name);
}

describe('the tools a scoped key sees', () => {
  it('offers everything when the key is not scoped', async () => {
    expect(await toolNames([])).toEqual(['create_contact', 'list_contacts', 'list_deals', 'passthrough']);
  });

  it('drops the writes for a read-only key', async () => {
    const names = await toolNames(['read:*']);

    expect(names).toContain('list_contacts');
    expect(names).not.toContain('create_contact');
  });

  it('drops the resources the key does not name', async () => {
    const names = await toolNames(['read:contacts']);

    expect(names).toEqual(['list_contacts']);
  });

  // Keeping a raw GET is worth more than removing the tool, and the enum is
  // what tells the model it cannot write through it.
  it('keeps passthrough for reading, with only GET on offer', async () => {
    const answer = (await dispatch(rpc('tools/list'), context(['read:*']))) as {
      result: { tools: { name: string; inputSchema: { properties: { method: { enum: string[] } } } }[] };
    };
    const raw = answer.result.tools.find((tool) => tool.name === 'passthrough');

    expect(raw?.inputSchema.properties.method.enum).toEqual(['GET']);
  });
});

describe('calling a tool the key does not allow', () => {
  it('fails without reaching the provider', async () => {
    calls.length = 0;

    const answer = (await dispatch(
      rpc('tools/call', { name: 'create_contact', arguments: { data: { name: 'Ana' } } }),
      context(['read:*'])
    )) as { result: { isError: boolean; content: { text: string }[] } };

    expect(answer.result.isError).toBe(true);
    expect(answer.result.content[0].text).toContain('FORBIDDEN');
    expect(calls).toHaveLength(0);
  });

  // The method travels in the arguments, so the list cannot be the only guard.
  it('refuses a write smuggled into passthrough', async () => {
    calls.length = 0;

    const answer = (await dispatch(
      rpc('tools/call', { name: 'passthrough', arguments: { path: '/deals', method: 'POST' } }),
      context(['read:*'])
    )) as { result: { isError: boolean } };

    expect(answer.result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('still allows what the scope does cover', async () => {
    calls.length = 0;

    await dispatch(rpc('tools/call', { name: 'list_contacts', arguments: {} }), context(['read:contacts']));

    expect(calls).toEqual(['listContacts']);
  });
});
