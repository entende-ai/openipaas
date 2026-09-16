import { describe, it, expect, vi } from 'vitest';
import { ProviderError } from '@/lib/providers/core/errors';
import { getManifest } from '@/lib/providers/core/registry';
import type { ProviderContext, ProviderManifest, UnifiedProvider } from '@/lib/providers/core/types';
import { bindingFor, callArgs, toolsFor, toolName } from '@/lib/mcp/tools';
import { dispatch, type McpContext } from '@/lib/mcp/server';
import { JSONRPC_ERRORS, LATEST_PROTOCOL_VERSION, negotiateVersion, parseMessage } from '@/lib/mcp/protocol';

/**
 * The MCP server is a translation layer: capabilities become tools, tool calls
 * become provider calls, provider failures become something a model can read.
 * These tests hold each of those three translations in place.
 */

const CREDENTIALS = { accessToken: 'at' } as unknown as ProviderContext;

function manifestWith(overrides: Partial<ProviderManifest>): ProviderManifest {
  return {
    slug: 'FAKE',
    name: 'Fake CRM',
    category: 'CRM',
    description: 'A provider that exists only in this test.',
    docsUrl: 'https://example.com',
    baseUrl: 'https://api.example.com/v1',
    auth: { type: 'API_KEY', fields: [{ key: 'token', label: 'Token' }] },
    rateLimit: { requestsPerSecond: 2, burst: 2 },
    capabilities: {},
    passthrough: false,
    enabled: true,
    ...overrides,
  } as ProviderManifest;
}

function contextFor(manifest: ProviderManifest, methods: Record<string, unknown> = {}): McpContext {
  return {
    requestId: 'req-1',
    clientName: 'Acme',
    provider: { manifest, ...methods } as unknown as UnifiedProvider,
    credentials: CREDENTIALS,
  };
}

const rpc = (method: string, params?: Record<string, unknown>) =>
  ({ jsonrpc: '2.0' as const, id: 1, method, params });

describe('tools from capabilities', () => {
  it('offers exactly what the account can do, and nothing else', async () => {
    const manifest = manifestWith({ capabilities: { contacts: ['list', 'get', 'create'], deals: ['list'] } });
    const names = toolsFor(manifest).map((tool) => tool.name);

    expect(names).toEqual(['create_contact', 'get_contact', 'list_contacts', 'list_deals']);
    expect(names).not.toContain('create_deal');
    expect(names).not.toContain('list_products');
  });

  it('gives a provider with no capabilities and no passthrough no tools at all', () => {
    expect(toolsFor(manifestWith({}))).toEqual([]);
  });

  it('adds passthrough only where the manifest advertises it', () => {
    expect(toolsFor(manifestWith({ passthrough: true })).map((t) => t.name)).toEqual(['passthrough']);
    expect(bindingFor(manifestWith({ passthrough: false }), 'passthrough')).toBeNull();
  });

  it('names a tool after one record or many, as the operation implies', () => {
    expect(toolName('companies', 'list')).toBe('list_companies');
    expect(toolName('companies', 'get')).toBe('get_company');
    expect(toolName('customers', 'bulkDeactivate')).toBe('bulk_deactivate_customers');
  });

  it('marks reads and deletes for clients that ask before acting', () => {
    const manifest = manifestWith({ capabilities: { products: ['list', 'delete'] } });
    const tools = Object.fromEntries(toolsFor(manifest).map((tool) => [tool.name, tool.annotations]));

    expect(tools.list_products).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.delete_product).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('describes a real provider in terms of itself', () => {
    const rd = getManifest('RD_STATION_CRM');
    const listContacts = toolsFor(rd).find((tool) => tool.name === 'list_contacts');

    expect(listContacts?.description).toContain('RD Station CRM');
    expect(toolsFor(rd).map((t) => t.name)).toContain('list_pipelines');
  });
});

describe('arguments for the provider call', () => {
  const manifest = manifestWith({
    capabilities: { contacts: ['list', 'get', 'create'], customers: ['update', 'bulkDelete'] },
    passthrough: true,
  });

  const argsFor = (name: string, args: Record<string, unknown>) =>
    callArgs(bindingFor(manifest, name)!, args);

  it('passes only the list parameters that were given', () => {
    expect(argsFor('list_contacts', {})).toEqual([{}]);
    expect(argsFor('list_contacts', { cursor: 'c1', limit: 50 })).toEqual([{ cursor: 'c1', limit: 50 }]);
  });

  it('orders id and body the way the provider methods take them', () => {
    expect(argsFor('get_contact', { id: 'x' })).toEqual(['x']);
    expect(argsFor('create_contact', { data: { name: 'Ana' } })).toEqual([{ name: 'Ana' }]);
    expect(argsFor('update_customer', { id: 'x', data: { name: 'Ana' } })).toEqual(['x', { name: 'Ana' }]);
    expect(argsFor('bulk_delete_customers', { ids: ['a', 'b'] })).toEqual([['a', 'b']]);
  });

  it('turns passthrough query values into the strings the contract takes', () => {
    // A model will happily send a number, and "[object Object]" in a query
    // string is the kind of bug that takes an afternoon.
    const [request] = argsFor('passthrough', { path: '/contacts', query: { 'page[size]': 5 } }) as [
      Record<string, unknown>,
    ];

    expect(request.method).toBe('GET');
    expect(request.query).toEqual({ 'page[size]': '5' });
  });
});

describe('the conversation', () => {
  it('answers initialize with a version the client asked for when we speak it', async () => {
    const ctx = contextFor(manifestWith({}));
    const response = await dispatch(rpc('initialize', { protocolVersion: '2024-11-05' }), ctx);

    expect((response.result as any).protocolVersion).toBe('2024-11-05');
    expect((response.result as any).serverInfo.name).toBe('openipaas');
    expect((response.result as any).instructions).toContain('Acme');
  });

  it('falls back to our latest version rather than agreeing to one we do not speak', () => {
    expect(negotiateVersion('1999-01-01')).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
  });

  it('calls the provider method behind the tool', async () => {
    const listContacts = vi.fn().mockResolvedValue({ items: [{ id: '1' }], hasMore: false, nextCursor: null });
    const ctx = contextFor(manifestWith({ capabilities: { contacts: ['list'] } }), { listContacts });

    const response = await dispatch(rpc('tools/call', { name: 'list_contacts', arguments: { limit: 10 } }), ctx);

    expect(listContacts).toHaveBeenCalledWith(CREDENTIALS, { limit: 10 });
    expect((response.result as any).structuredContent.items).toEqual([{ id: '1' }]);
    expect((response.result as any).isError).toBeUndefined();
  });

  it('reports a provider failure as a readable result, not a protocol error', async () => {
    const createDeal = vi.fn().mockRejectedValue(new ProviderError('NOT_FOUND', 'That stage does not exist.'));
    const ctx = contextFor(manifestWith({ capabilities: { deals: ['create'] } }), { createDeal });

    const response = await dispatch(rpc('tools/call', { name: 'create_deal', arguments: { data: {} } }), ctx);

    // A model can read this and try something else; a JSON-RPC error would end
    // the turn with a transport problem it cannot act on.
    expect(response.error).toBeUndefined();
    expect((response.result as any).isError).toBe(true);
    expect((response.result as any).content[0].text).toContain('That stage does not exist.');
  });

  it('never leaks the internals of an unexpected failure', async () => {
    const listDeals = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const ctx = contextFor(manifestWith({ capabilities: { deals: ['list'] } }), { listDeals });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await dispatch(rpc('tools/call', { name: 'list_deals' }), ctx);
    const text = (response.result as any).content[0].text;

    expect(text).not.toContain('ECONNREFUSED');
    expect(text).toContain('req-1');
    quiet.mockRestore();
  });

  it('refuses a tool this account does not have', async () => {
    const ctx = contextFor(manifestWith({ capabilities: { contacts: ['list'] } }));
    const response = await dispatch(rpc('tools/call', { name: 'delete_everything' }), ctx);

    expect(response.error?.code).toBe(JSONRPC_ERRORS.INVALID_PARAMS);
    expect(response.error?.message).toContain('tools/list');
  });

  it('answers an unknown method with method not found', async () => {
    const response = await dispatch(rpc('resources/list'), contextFor(manifestWith({})));
    expect(response.error?.code).toBe(JSONRPC_ERRORS.METHOD_NOT_FOUND);
  });

  it('lists the tools an account offers', async () => {
    const ctx = contextFor(manifestWith({ capabilities: { deals: ['list', 'create'] } }));
    const response = await dispatch(rpc('tools/list'), ctx);

    expect((response.result as any).tools.map((t: any) => t.name)).toEqual(['create_deal', 'list_deals']);
  });
});

describe('the envelope', () => {
  it('accepts a well-formed request', () => {
    const parsed = parseMessage({ jsonrpc: '2.0', id: 7, method: 'ping' });
    expect('message' in parsed && parsed.message.method).toBe('ping');
  });

  it('rejects anything that is not a single JSON-RPC 2.0 object', () => {
    // Batches were removed from MCP in 2025-06-18, and pretending otherwise
    // would mean answering with a shape no client expects.
    expect(parseMessage([{ jsonrpc: '2.0', method: 'ping' }])).toHaveProperty('error');
    expect(parseMessage({ jsonrpc: '1.0', method: 'ping' })).toHaveProperty('error');
    expect(parseMessage({ jsonrpc: '2.0' })).toHaveProperty('error');
    expect(parseMessage({ jsonrpc: '2.0', method: 'ping', params: [] })).toHaveProperty('error');
    expect(parseMessage('ping')).toHaveProperty('error');
  });

  it('treats a message with no id as a notification', () => {
    const parsed = parseMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect('message' in parsed && parsed.message.id).toBeUndefined();
  });
});
