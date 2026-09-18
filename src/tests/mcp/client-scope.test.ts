import { describe, it, expect, vi } from 'vitest';
import type { ProviderContext, ProviderManifest, UnifiedProvider } from '@/lib/providers/core/types';
import { dispatch, type McpContext, type McpConnection } from '@/lib/mcp/server';
import { prefixesFor, connectionLabel, clientScopePrefixes, PREFIX_SEPARATOR } from '@/lib/mcp/connections';
import { GUIDE_URI, CAPABILITIES_URI, providerUri, readResource } from '@/lib/mcp/resources';

/**
 * One server covering a whole client.
 *
 * A connection-scoped server is one account and its tools keep plain names. A
 * client-scoped one may hold several accounts, so every tool says which account
 * it belongs to. What these tests hold in place is that a call lands on the
 * account its name claims, and that the names do not move around.
 */

function manifestWith(overrides: Partial<ProviderManifest>): ProviderManifest {
  return {
    slug: 'FAKE',
    name: 'Fake CRM',
    category: 'CRM',
    description: 'A provider that exists only in this test.',
    baseUrl: 'https://api.example.com/v1',
    auth: { type: 'API_KEY', fields: [{ key: 'token', label: 'Token' }] },
    capabilities: {},
    passthrough: false,
    enabled: true,
    ...overrides,
  } as ProviderManifest;
}

function connection(overrides: Partial<McpConnection> & { manifest: ProviderManifest; methods?: Record<string, unknown> }): McpConnection {
  const { manifest, methods = {}, ...rest } = overrides;
  return {
    provider: { manifest, ...methods } as unknown as UnifiedProvider,
    credentials: { accessToken: 'at' } as unknown as ProviderContext,
    prefix: '',
    label: manifest.name,
    ...rest,
  };
}

function clientScope(connections: McpConnection[]): McpContext {
  return { requestId: 'req-1', clientName: 'LadiGroup', scope: 'client', connections };
}

const rpc = (method: string, params?: Record<string, unknown>) =>
  ({ jsonrpc: '2.0' as const, id: 1, method, params });

const CRM = manifestWith({ slug: 'RD_STATION_CRM', name: 'RD Station CRM', capabilities: { contacts: ['list'] } });
const ERP = manifestWith({
  slug: 'CONTA_AZUL',
  name: 'Conta Azul',
  category: 'ACCOUNTING',
  capabilities: { customers: ['list', 'get'] },
  passthrough: true,
});

describe('naming the accounts', () => {
  it('uses the provider, lowercased, when it is the only one of its kind', () => {
    expect(prefixesFor([{ id: 'a', providerSlug: 'RD_STATION_CRM' }])).toEqual([`rd_station_crm${PREFIX_SEPARATOR}`]);
  });

  // Two accounts on one provider is the case that breaks a naive scheme.
  it('tells two accounts on one provider apart', () => {
    const prefixes = prefixesFor([
      { id: 'aaaaaaaa-1111-2222-3333-444444444444', providerSlug: 'RD_STATION_CRM' },
      { id: 'bbbbbbbb-1111-2222-3333-444444444444', providerSlug: 'RD_STATION_CRM' },
    ]);

    expect(prefixes[0]).not.toBe(prefixes[1]);
    expect(prefixes[0]).toContain('rd_station_crm_aaaaaa');
  });

  // A prefix built from a position would move when an unrelated account goes.
  it('keeps a prefix stable when another account is removed', () => {
    const kept = { id: 'aaaaaaaa-1111', providerSlug: 'RD_STATION_CRM' };
    const other = { id: 'cccccccc-1111', providerSlug: 'CONTA_AZUL' };

    expect(prefixesFor([other, kept])[1]).toBe(prefixesFor([kept])[0]);
  });

  it('names an account by its label when it has one', () => {
    expect(connectionLabel('RD Station CRM', 'LAD')).toBe('RD Station CRM (LAD)');
    expect(connectionLabel('RD Station CRM', null)).toBe('RD Station CRM');
  });

  // Every connection is labelled with its provider name by default, which used
  // to print "RD Station CRM (RD Station CRM)" in the instructions an agent reads.
  it('does not repeat a label that only restates the provider', () => {
    expect(connectionLabel('RD Station CRM', 'RD Station CRM')).toBe('RD Station CRM');
    expect(connectionLabel('RD Station CRM', ' rd station crm ')).toBe('RD Station CRM');
    expect(connectionLabel('RD Station CRM', '   ')).toBe('RD Station CRM');
  });

  // The dashboard and the server must agree, so both skip what the server skips.
  it('gives no prefix to a connection the server would leave out', () => {
    const prefixes = clientScopePrefixes([
      { id: 'aaaaaaaa-1', providerSlug: 'RD_STATION_CRM', usable: true },
      { id: 'bbbbbbbb-1', providerSlug: 'RD_STATION_CRM', usable: false },
    ]);

    // One usable RD account is a lone account: no id fragment in its prefix.
    expect(prefixes.get('aaaaaaaa-1')).toBe('rd_station_crm__');
    expect(prefixes.has('bbbbbbbb-1')).toBe(false);
  });
});

describe('the tools of several accounts', () => {
  const ctx = clientScope([
    connection({ manifest: CRM, prefix: 'rd_station_crm__', label: 'RD Station CRM' }),
    connection({ manifest: ERP, prefix: 'conta_azul__', label: 'Conta Azul' }),
  ]);

  it('carries the account in every name, so none of them is ambiguous', async () => {
    const response = await dispatch(rpc('tools/list'), ctx);
    const names = (response.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);

    expect(names).toEqual([
      'rd_station_crm__list_contacts',
      'conta_azul__get_customer',
      'conta_azul__list_customers',
      'conta_azul__passthrough',
    ]);
  });

  // The alternative, one `connection` argument, would offer list_contacts on an
  // accounting system and let the model find out by failing.
  it('offers no tool that is invalid for the account it names', async () => {
    const response = await dispatch(rpc('tools/list'), ctx);
    const names = (response.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);

    expect(names).not.toContain('conta_azul__list_contacts');
    expect(names).not.toContain('rd_station_crm__list_customers');
    expect(names).not.toContain('rd_station_crm__passthrough');
  });
});

describe('calling one of them', () => {
  it('lands on the account the name says, and no other', async () => {
    const crm = vi.fn().mockResolvedValue({ items: [{ id: 'c1' }], hasMore: false, nextCursor: null });
    const erp = vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });

    const ctx = clientScope([
      connection({ manifest: CRM, prefix: 'rd_station_crm__', label: 'RD', methods: { listContacts: crm } }),
      connection({ manifest: ERP, prefix: 'conta_azul__', label: 'CA', methods: { listCustomers: erp } }),
    ]);

    await dispatch(rpc('tools/call', { name: 'rd_station_crm__list_contacts', arguments: { limit: 5 } }), ctx);

    expect(crm).toHaveBeenCalledOnce();
    expect(erp).not.toHaveBeenCalled();
  });

  it('refuses a name that belongs to no account here', async () => {
    const ctx = clientScope([connection({ manifest: CRM, prefix: 'rd_station_crm__', label: 'RD' })]);
    const response = await dispatch(rpc('tools/call', { name: 'conta_azul__list_customers' }), ctx);

    expect(response.error?.message).toContain('LadiGroup');
    expect(response.error?.message).toContain('tools/list');
  });

  // A tool of the right shape but the wrong account must not fall through to
  // whichever connection happens to be first.
  it('refuses an unprefixed name in client scope', async () => {
    const called = vi.fn();
    const ctx = clientScope([
      connection({ manifest: CRM, prefix: 'rd_station_crm__', label: 'RD', methods: { listContacts: called } }),
    ]);

    const response = await dispatch(rpc('tools/call', { name: 'list_contacts' }), ctx);

    expect(response.error).toBeDefined();
    expect(called).not.toHaveBeenCalled();
  });

  it('routes to the right one of two accounts on the same provider', async () => {
    const first = vi.fn().mockResolvedValue({ items: [] });
    const second = vi.fn().mockResolvedValue({ items: [] });

    const [one, two] = prefixesFor([
      { id: 'aaaaaaaa-1111', providerSlug: 'RD_STATION_CRM' },
      { id: 'bbbbbbbb-1111', providerSlug: 'RD_STATION_CRM' },
    ]);

    const ctx = clientScope([
      connection({ manifest: CRM, prefix: one, label: 'one', methods: { listContacts: first } }),
      connection({ manifest: CRM, prefix: two, label: 'two', methods: { listContacts: second } }),
    ]);

    await dispatch(rpc('tools/call', { name: `${two}list_contacts` }), ctx);

    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  /*
   * Matching is by prefix, so a prefix that started another one would route by
   * whichever was tried first. The separator is what prevents it: two accounts
   * on one provider differ before the `__`, and a slug that starts another slug
   * is followed by `_` on one side and `__` on the other. This asserts the
   * property rather than the sort, because the sort cannot be observed while the
   * property holds, and it is the property that would break if the separator
   * were ever shortened to a single underscore.
   */
  it('gives no account a prefix that starts another account name', () => {
    const prefixes = prefixesFor([
      { id: 'aaaaaaaa-1111', providerSlug: 'RD_STATION' },
      { id: 'bbbbbbbb-1111', providerSlug: 'RD_STATION_CRM' },
      { id: 'cccccccc-1111', providerSlug: 'RD_STATION_CRM' },
      { id: 'dddddddd-1111', providerSlug: 'CONTA_AZUL' },
    ]);

    for (const outer of prefixes) {
      for (const inner of prefixes) {
        if (outer === inner) continue;
        expect(outer.startsWith(inner)).toBe(false);
      }
    }
  });
});

describe('the documentation of a client scope', () => {
  const ctx = clientScope([
    connection({ manifest: CRM, prefix: 'rd_station_crm__', label: 'RD Station CRM (LAD)' }),
    connection({ manifest: ERP, prefix: 'conta_azul__', label: 'Conta Azul' }),
  ]);

  it('says which accounts are on this server and how their tools are named', () => {
    const text = readResource(GUIDE_URI, ctx)!.text;

    expect(text).toContain('LadiGroup');
    expect(text).toContain('RD Station CRM (LAD)');
    expect(text).toContain('`rd_station_crm__`');
    expect(text).toContain('Conta Azul');
    expect(text).toContain('4 tools');
  });

  it('describes passthrough only for the account that has it', () => {
    const text = readResource(GUIDE_URI, ctx)!.text;

    expect(text).toContain('conta_azul__passthrough');
    expect(text).not.toContain('rd_station_crm__passthrough');
  });

  it('gives each account its own notes, at its own uri', async () => {
    const response = await dispatch(rpc('resources/list'), ctx);
    const uris = (response.result as { resources: { uri: string }[] }).resources.map((entry) => entry.uri);

    expect(uris).toContain(providerUri('rd_station_crm'));
    expect(uris).toContain(providerUri('conta_azul'));

    const notes = readResource(providerUri('conta_azul'), ctx)!.text;
    expect(notes).toContain('Tools for this account start with `conta_azul__`');
  });

  it('reports the matrix per account, with the prefixed tool names', () => {
    const payload = JSON.parse(readResource(CAPABILITIES_URI, ctx)!.text);

    expect(payload.client).toBe('LadiGroup');
    expect(payload.connections).toHaveLength(2);
    expect(payload.connections[0]).toMatchObject({
      toolPrefix: 'rd_station_crm__',
      provider: { slug: 'RD_STATION_CRM' },
      resources: [{ resource: 'contacts', operations: [{ operation: 'list', tool: 'rd_station_crm__list_contacts' }] }],
    });
  });

  it('is honest about a client with nothing connected', async () => {
    const empty = clientScope([]);

    expect(readResource(GUIDE_URI, empty)!.text).toContain('None yet');
    expect((await dispatch(rpc('tools/list'), empty)).result).toEqual({ tools: [] });
    expect((await dispatch(rpc('initialize'), empty)).result).toMatchObject({
      instructions: expect.stringContaining('none yet'),
    });
  });

  it('tells the model up front that names carry the account', async () => {
    const response = await dispatch(rpc('initialize'), ctx);

    expect((response.result as { instructions: string }).instructions).toContain('2 accounts');
    expect((response.result as { instructions: string }).instructions).toContain('starts with the account');
  });
});
