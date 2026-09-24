import { describe, it, expect } from 'vitest';
import { RdStationCrmProvider } from '@/lib/providers/implementations/rdstationcrm/provider';
import { rdStationCrmManifest } from '@/lib/providers/implementations/rdstationcrm/manifest';
import { dealAmount } from '@/lib/providers/implementations/rdstationcrm/mappers/crm';
import { makeContext, stubFetch, noSleep } from '../helpers';

/**
 * The unified CRM mapping for RD Station.
 *
 * Passthrough behaviour lives in rdstationcrm.test.ts; this file is about what
 * comes out of the mappers and how many requests it costs.
 */

const ctx = makeContext({ provider: 'RD_STATION_CRM', accessToken: 'live-token' });

function provider(responses: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(responses);
  return { stub, sut: new RdStationCrmProvider({ fetchImpl: stub.fetch, sleep: noSleep }) };
}

const USERS = {
  json: { data: [{ id: 'u1', name: 'Joao Pereira', email: 'joao@empresa.com.br' }], links: { next: null } },
};

const PIPELINES = {
  json: { data: [{ id: 'p1', name: 'Funil de Vendas', order: 1 }], links: { next: null } },
};

const STAGES = {
  json: {
    data: [
      { id: 's2', name: 'Contato feito', order: 2 },
      { id: 's1', name: 'Sem contato', order: 1 },
    ],
    links: { next: null },
  },
};

const CONTACT = {
  id: 'c1',
  name: 'Maria Souza',
  job_title: 'Diretora Comercial',
  emails: [{ email: 'maria@exemplo.com.br' }, { email: 'maria.souza@exemplo.com.br' }],
  phones: [{ phone: '+5511999999999', type: 'mobile' }],
  organization_id: 'o1',
  created_at: '2026-04-22T17:02:29.000Z',
  updated_at: '2026-05-02T12:00:00.000Z',
};

const DEAL = {
  id: 'd1',
  name: 'Implantacao',
  status: 'ongoing',
  recurrence_price: 1200,
  one_time_price: 5000,
  total_price: 6200,
  stage_id: 's2',
  pipeline_id: 'p1',
  owner_id: 'u1',
  organization_id: 'o1',
  contact_ids: ['c1'],
  closed_at: null,
  created_at: '2026-04-22T17:02:29.000Z',
  updated_at: null,
};

describe('RD Station contacts', () => {
  it('lists contacts, flattening the email and phone objects', async () => {
    const { stub, sut } = provider([{ json: { data: [CONTACT], links: { next: null } } }, USERS]);

    const page = await sut.listContacts(ctx, {});

    expect(new URL(stub.calls[0].url).pathname).toBe('/crm/v2/contacts');
    expect(page.items[0]).toMatchObject({
      id: 'c1',
      name: 'Maria Souza',
      email: 'maria@exemplo.com.br',
      emails: ['maria@exemplo.com.br', 'maria.souza@exemplo.com.br'],
      phones: ['+5511999999999'],
      title: 'Diretora Comercial',
      companyId: 'o1',
    });
    expect(page.items[0].remoteData?.raw).toEqual(CONTACT);
  });

  // RD reports no total anywhere, so links.next is the only honest signal.
  it('pages on links.next rather than inventing a total', async () => {
    const withNext = {
      json: { data: [CONTACT], links: { next: 'https://api.rd.services/crm/v2/contacts?page%5Bnumber%5D=2' } },
    };

    const first = provider([withNext, USERS]);
    const page = await first.sut.listContacts(ctx, {});

    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    expect(page.totalItems).toBeUndefined();

    const second = provider([{ json: { data: [CONTACT], links: { next: null } } }, USERS]);
    const last = await second.sut.listContacts(ctx, { cursor: page.nextCursor as string });

    expect(new URL(second.stub.calls[0].url).searchParams.get('page[number]')).toBe('2');
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
  });

  it('wraps a create in the data envelope RD expects', async () => {
    const { stub, sut } = provider([{ status: 201, json: { data: { ...CONTACT, id: 'c2' } } }, USERS]);

    const created = await sut.createContact(ctx, {
      name: 'Maria Souza',
      email: 'maria@exemplo.com.br',
      phones: ['+5511999999999'],
      title: 'Diretora Comercial',
      companyId: 'o1',
    });

    expect(stub.calls[0].method).toBe('POST');
    expect(stub.calls[0].body).toEqual({
      data: {
        name: 'Maria Souza',
        emails: [{ email: 'maria@exemplo.com.br' }],
        phones: [{ phone: '+5511999999999', type: 'work' }],
        job_title: 'Diretora Comercial',
        organization_id: 'o1',
      },
    });
    expect(created.id).toBe('c2');
  });
});

describe('RD Station companies', () => {
  const organization = {
    id: 'o1',
    name: 'Acme Corp',
    url: 'https://acme.com.br',
    owner_id: 'u1',
    custom_fields: { cnpj: '11.111.111/0001-11' },
    created_at: '2026-04-22T17:02:29.000Z',
    updated_at: null,
  };

  it('maps an organization, with the owner name and the document custom field', async () => {
    const { sut } = provider([{ json: { data: [organization], links: { next: null } } }, USERS]);

    const page = await sut.listCompanies(ctx, {});

    expect(page.items[0]).toMatchObject({
      id: 'o1',
      name: 'Acme Corp',
      website: 'https://acme.com.br',
      // Digits only, because each account types it however it likes.
      document: '11111111000111',
      owner: { id: 'u1', name: 'Joao Pereira', email: 'joao@empresa.com.br' },
    });
  });

  it('does not write the document, whose custom field slug differs per account', async () => {
    const { stub, sut } = provider([{ status: 201, json: { data: { id: 'o2', name: 'Acme' } } }, USERS]);

    await sut.createCompany(ctx, { name: 'Acme', document: '11111111000111', website: 'https://acme.com.br' });

    expect(stub.calls[0].body).toEqual({ data: { name: 'Acme', url: 'https://acme.com.br' } });
  });
});

describe('RD Station deals', () => {
  it('names the stage and the pipeline, which RD sends only as ids', async () => {
    const { sut } = provider([{ json: { data: [DEAL], links: { next: null } } }, USERS, PIPELINES, STAGES]);

    const page = await sut.listDeals(ctx, {});

    expect(page.items[0]).toMatchObject({
      id: 'd1',
      status: 'OPEN',
      amount: 6200,
      currency: null,
      stageId: 's2',
      stageName: 'Contato feito',
      pipelineId: 'p1',
      pipelineName: 'Funil de Vendas',
      companyId: 'o1',
      contactIds: ['c1'],
      owner: { id: 'u1', name: 'Joao Pereira' },
    });
  });

  it('reads the reference lists once, however many deals came back', async () => {
    const { stub, sut } = provider([
      { json: { data: [DEAL, { ...DEAL, id: 'd2' }, { ...DEAL, id: 'd3' }], links: { next: null } } },
      USERS,
      PIPELINES,
      STAGES,
    ]);

    await sut.listDeals(ctx, {});

    const paths = stub.calls.map((call) => new URL(call.url).pathname);
    expect(paths.filter((path) => path.endsWith('/users'))).toHaveLength(1);
    expect(paths.filter((path) => path.endsWith('/pipelines'))).toHaveLength(1);
  });

  it('translates the status vocabulary, and adds the prices when no total came', async () => {
    const won = { ...DEAL, status: 'won', total_price: undefined, closed_at: '2026-06-01T10:00:00.000Z' };
    const { sut } = provider([{ json: { data: [won], links: { next: null } } }, USERS, PIPELINES, STAGES]);

    const page = await sut.listDeals(ctx, {});

    expect(page.items[0].status).toBe('WON');
    expect(page.items[0].amount).toBe(6200);
    expect(page.items[0].closedAt).toBe('2026-06-01T10:00:00.000Z');
  });

  it('sends a deal into a funnel by stage, never by pipeline', async () => {
    const { stub, sut } = provider([{ status: 201, json: { data: DEAL } }, USERS, PIPELINES, STAGES]);

    await sut.createDeal(ctx, {
      name: 'Implantacao',
      stageId: 's2',
      pipelineId: 'p1',
      companyId: 'o1',
      contactIds: ['c1'],
      amount: 5000,
    });

    expect(stub.calls[0].body).toEqual({
      data: {
        name: 'Implantacao',
        // Only ongoing is accepted on create, and pipeline_id is read only.
        status: 'ongoing',
        stage_id: 's2',
        organization_id: 'o1',
        contact_ids: ['c1'],
        one_time_price: 5000,
      },
    });
  });

  // Losing the user list must not lose the deals.
  it('falls back to bare ids when the reference lists cannot be read', async () => {
    const { sut } = provider([
      { json: { data: [DEAL], links: { next: null } } },
      { status: 403, json: { errors: ['forbidden'] } },
    ]);

    const page = await sut.listDeals(ctx, {});

    expect(page.items[0].owner).toEqual({ id: 'u1', name: null, email: null });
    expect(page.items[0].stageName).toBeNull();
  });
});

describe('RD Station pipelines', () => {
  it('returns each funnel with its stages in order', async () => {
    const { sut } = provider([PIPELINES, STAGES]);

    const page = await sut.listPipelines(ctx, {});

    expect(page.items).toHaveLength(1);
    expect(page.items[0].name).toBe('Funil de Vendas');
    expect(page.items[0].stages.map((stage) => stage.name)).toEqual(['Sem contato', 'Contato feito']);
    expect(page.hasMore).toBe(false);
  });
});

describe('RD Station contact search and upsert', () => {
  it('filters with RDQL rather than fetching everything and sifting', async () => {
    const { stub, sut } = provider([{ json: { data: [CONTACT], links: { next: null } } }, USERS]);

    const page = await sut.searchContacts(ctx, { field: 'email', value: 'maria@exemplo.com.br' });

    const url = new URL(stub.calls[0].url);
    expect(url.pathname).toBe('/crm/v2/contacts');
    expect(url.searchParams.get('filter')).toBe('email:maria@exemplo.com.br');
    expect(page.items[0].id).toBe('c1');
  });

  /**
   * RD answers an unknown filter property with every record instead of none, so
   * an unchecked field behind an upsert would match a stranger and overwrite
   * them. The check has to happen before the request, not after.
   */
  it('refuses a field RD does not filter on, without calling RD', async () => {
    const { stub, sut } = provider([{ json: { data: [], links: { next: null } } }]);

    await expect(sut.searchContacts(ctx, { field: 'cpf', value: '111' })).rejects.toThrow(/cannot match contacts/);
    expect(stub.calls).toHaveLength(0);
  });

  it('allows a custom field, which is per account and cannot be listed', async () => {
    const { stub, sut } = provider([{ json: { data: [], links: { next: null } } }, USERS]);

    await sut.searchContacts(ctx, { field: '@cpf', value: '11111111111' });
    expect(new URL(stub.calls[0].url).searchParams.get('filter')).toBe('@cpf:11111111111');
  });

  // A space starts a second RDQL clause, so it would silently become another query.
  it('refuses a value with a space in it', async () => {
    const { stub, sut } = provider([{ json: { data: [], links: { next: null } } }]);

    await expect(sut.searchContacts(ctx, { field: 'name', value: 'Maria Souza' })).rejects.toThrow(/spaces/);
    expect(stub.calls).toHaveLength(0);
  });

  it('creates when the match finds nothing, and keeps the matched email', async () => {
    const { stub, sut } = provider([
      { json: { data: [], links: { next: null } } },
      { status: 201, json: { data: { ...CONTACT, id: 'c9' } } },
      USERS,
    ]);

    const result = await sut.upsertContact(ctx, { field: 'email', value: 'nova@exemplo.com.br' }, { name: 'Nova' });

    expect(result.created).toBe(true);
    expect(stub.calls[1].method).toBe('POST');
    // Without this the next upsert on the same email creates another contact.
    expect(stub.calls[1].body).toEqual({
      data: { name: 'Nova', emails: [{ email: 'nova@exemplo.com.br' }] },
    });
  });

  it('updates the one it found, with PUT and only the fields sent', async () => {
    const { stub, sut } = provider([
      { json: { data: [CONTACT], links: { next: null } } },
      { json: { data: { ...CONTACT, job_title: 'CEO' } } },
      USERS,
    ]);

    const result = await sut.upsertContact(ctx, { field: 'email', value: 'maria@exemplo.com.br' }, { title: 'CEO' });

    expect(result.created).toBe(false);
    expect(result.record.title).toBe('CEO');
    expect(stub.calls[1].method).toBe('PUT');
    expect(new URL(stub.calls[1].url).pathname).toBe('/crm/v2/contacts/c1');
    expect(stub.calls[1].body).toEqual({ data: { name: undefined, job_title: 'CEO' } });
  });

  /**
   * Writing to whichever one came back first would put somebody's data on a
   * stranger's record, and the caller would never know.
   */
  it('refuses to guess when the match finds several', async () => {
    const { stub, sut } = provider([
      { json: { data: [CONTACT, { ...CONTACT, id: 'c2' }], links: { next: null } } },
    ]);

    await expect(
      sut.upsertContact(ctx, { field: 'name', value: 'Maria' }, { title: 'CEO' })
    ).rejects.toThrow(/matches 2 contacts/);

    // One call: the search. Nothing was written.
    expect(stub.calls).toHaveLength(1);
  });
});

/**
 * `total_price` is derived and read only, so RD sends it on every deal. That
 * makes presence useless as a signal, and the whole of this block is about not
 * reading "RD has nothing to say" as "this is worth nothing".
 */
describe('what a deal is worth', () => {
  it('is null when every price RD sends is zero', () => {
    expect(dealAmount({ total_price: 0, one_time_price: 0, recurrence_price: 0 })).toBeNull();
  });

  it('is the parts when the derived total is zero but a part is not', () => {
    expect(dealAmount({ total_price: 0, one_time_price: 500, recurrence_price: 0 })).toBe(500);
    expect(dealAmount({ total_price: 0, one_time_price: 500, recurrence_price: 100 })).toBe(600);
  });

  it('is the derived total when RD filled it in', () => {
    expect(dealAmount({ total_price: 250, one_time_price: 0, recurrence_price: 0 })).toBe(250);
  });

  // `Number(null)` is 0, which reads as a perfectly good finite number.
  it('is null when the prices are null, absent or blank', () => {
    expect(dealAmount({ total_price: null, one_time_price: null, recurrence_price: null })).toBeNull();
    expect(dealAmount({})).toBeNull();
    expect(dealAmount({ total_price: '', one_time_price: '' })).toBeNull();
    expect(dealAmount(undefined)).toBeNull();
  });

  it('takes the numbers RD sends as strings', () => {
    expect(dealAmount({ total_price: '1500.50' })).toBe(1500.5);
  });

  it('is null rather than zero all the way through a list', async () => {
    const free = { ...DEAL, total_price: 0, one_time_price: 0, recurrence_price: 0 };
    const { sut } = provider([{ json: { data: [free], links: { next: null } } }, USERS, PIPELINES, STAGES]);

    const page = await sut.listDeals(ctx, {});

    expect(page.items[0].amount).toBeNull();
  });
});

/**
 * The columns an account added itself, which is most of what an RD account
 * actually uses. Before this they were only in `remoteData.raw`, so reading
 * them meant knowing RD's shape, which is the thing a unified layer is for.
 */
describe('the fields an account added itself', () => {
  const withFields = {
    ...DEAL,
    custom_fields: {
      responsavel: 'Fabio',
      'log-de-contatos': 'Ligacao em 02/05',
      'propostas-enviadas': 3,
      'etapa-do-negocio': null,
      interesse: ['Consultoria', 'Treinamento'],
      contratado: true,
      anexo: { url: 'https://exemplo.com.br/a.pdf' },
    },
  };

  it('carries them on a deal, keyed by the slug RD uses', async () => {
    const { sut } = provider([{ json: { data: [withFields], links: { next: null } } }, USERS, PIPELINES, STAGES]);

    const page = await sut.listDeals(ctx, {});
    const fields = page.items[0].customFields ?? [];
    const byKey = Object.fromEntries(fields.map((field) => [field.key, field.value]));

    // Hyphens and all: the slug is how the account names the column, and a
    // rewritten key has no way back to the original.
    expect(byKey['log-de-contatos']).toBe('Ligacao em 02/05');
    expect(byKey.responsavel).toBe('Fabio');
    expect(byKey['propostas-enviadas']).toBe('3');
    expect(byKey.contratado).toBe('true');
    expect(byKey.interesse).toBe('Consultoria, Treinamento');
  });

  it('says null for an empty one rather than leaving it out', async () => {
    const { sut } = provider([{ json: { data: [withFields], links: { next: null } } }, USERS, PIPELINES, STAGES]);

    const fields = (await sut.listDeals(ctx, {})).items[0].customFields ?? [];

    expect(fields.find((field) => field.key === 'etapa-do-negocio')).toEqual({
      key: 'etapa-do-negocio',
      label: null,
      value: null,
    });
  });

  // A JSON blob in a string field is not a value anyone can use, and the raw
  // payload still has it.
  it('says null for a shape a string cannot carry', async () => {
    const { sut } = provider([{ json: { data: [withFields], links: { next: null } } }, USERS, PIPELINES, STAGES]);

    const fields = (await sut.listDeals(ctx, {})).items[0].customFields ?? [];

    expect(fields.find((field) => field.key === 'anexo')?.value).toBeNull();
  });

  it('carries them on contacts and companies too', async () => {
    const contacts = provider([
      { json: { data: [{ ...CONTACT, custom_fields: { cargo_real: 'Socia' } }], links: { next: null } } },
      USERS,
    ]);
    const companies = provider([
      { json: { data: [{ id: 'o1', name: 'Acme', custom_fields: { segmento: 'Servicos' } }], links: { next: null } } },
      USERS,
    ]);

    expect((await contacts.sut.listContacts(ctx, {})).items[0].customFields).toEqual([
      { key: 'cargo_real', label: null, value: 'Socia' },
    ]);
    expect((await companies.sut.listCompanies(ctx, {})).items[0].customFields).toEqual([
      { key: 'segmento', label: null, value: 'Servicos' },
    ]);
  });

  // An empty list means this record has none. The field being absent would
  // mean the service has no such concept, which is a different answer.
  it('is an empty list on a record with none, not absent', async () => {
    const { sut } = provider([{ json: { data: [DEAL], links: { next: null } } }, USERS, PIPELINES, STAGES]);

    expect((await sut.listDeals(ctx, {})).items[0].customFields).toEqual([]);
  });

  it('is declared in the manifest, so a caller can ask before calling', () => {
    expect(rdStationCrmManifest.customFields).toEqual(['contacts', 'companies', 'deals']);
  });
});
