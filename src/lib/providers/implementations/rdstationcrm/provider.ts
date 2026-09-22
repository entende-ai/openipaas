import { BaseProvider } from '@/lib/providers/core/BaseProvider';
import { encodeCursor, readPage } from '@/lib/providers/core/pagination';
import { ProviderError } from '@/lib/providers/core/errors';
import type {
  ListParams,
  Page,
  ProviderContext,
  ProviderManifest,
  RecordMatch,
  UpsertResult,
} from '@/lib/providers/core/types';
import type { UnifiedCompany, UnifiedContact, UnifiedDeal, UnifiedOwner, UnifiedPipeline } from '@/types/unified';

import { rdStationCrmManifest } from './manifest';
import {
  mapRdContactToUnified,
  mapRdDealToUnified,
  mapRdOrganizationToUnified,
  mapRdPipelineToUnified,
  mapUnifiedCompanyToRd,
  mapUnifiedContactToRd,
  mapUnifiedDealToRd,
  type OwnerLookup,
  type StageLookup,
} from './mappers/crm';

/**
 * RD Station CRM provider.
 *
 * Unified contacts, companies, deals and pipelines, plus passthrough for
 * everything the unified model does not cover. BaseProvider supplies URL
 * building, throttling, retries and token renewal.
 *
 * Two RD shapes decide most of what follows:
 *
 *   - Paging is `page[number]` and `page[size]`, and the response carries no
 *     total. `links.next` is the only signal that another page exists, so
 *     `totalItems` stays absent rather than being guessed.
 *   - Records reference users, pipelines and stages by id and never embed
 *     them. Those three lists are small, account-level reference data, so they
 *     are fetched at most once per provider instance (which is per request)
 *     and used to fill in the names. Organizations are not: they are ordinary
 *     data, and resolving one per deal would turn a page into 26 requests.
 */

const DEFAULT_PAGE_SIZE = 25;

/**
 * What RD documents as filterable on GET /contacts.
 *
 * Kept as a list because RD answers an unknown filter property by returning
 * every record rather than none, so an unchecked field behind an upsert reads
 * as "matches 25 contacts" at best and overwrites a stranger at worst.
 */
const CONTACT_MATCH_FIELDS = [
  'email',
  'phone',
  'name',
  'job_title',
  'whatsapp_username',
  'organization_id',
] as const;

interface RdListResponse {
  data?: unknown[];
  links?: { next?: string | null };
}

/**
 * An instant in the shape RDQL wants: `"YYYY-MM-DD HH:MM:SS"`, quoted because
 * it contains a space.
 *
 * Sent as UTC. RD documents the format and not the zone, and UTC is the only
 * choice that is the same for every account rather than silently wrong for the
 * ones in another timezone.
 */
export function rdqlDateTime(iso: string): string {
  return `"${new Date(iso).toISOString().slice(0, 19).replace('T', ' ')}"`;
}

export class RdStationCrmProvider extends BaseProvider {
  readonly manifest: ProviderManifest = rdStationCrmManifest;

  private ownersByIdPromise: Promise<Map<string, UnifiedOwner>> | null = null;
  private funnelPromise: Promise<{
    pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
    stageIndex: Map<string, { pipelineId: string; pipelineName: string; stageName: string }>;
  }> | null = null;

  /* ---------------------------------------------------------------- *
   * Contacts
   * ---------------------------------------------------------------- */

  async listContacts(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedContact>> {
    this.assertSupports('contacts', 'list');

    const { data, nextCursor } = await this.listPage(ctx, '/contacts', params);
    const owners = await this.ownerLookup(ctx);

    return this.page(
      data.map((raw) => mapRdContactToUnified(raw, owners)),
      { nextCursor }
    );
  }

  async getContact(ctx: ProviderContext, id: string): Promise<UnifiedContact> {
    this.assertSupports('contacts', 'get');

    const response = await this.request(ctx, { method: 'GET', path: `/contacts/${encodeURIComponent(id)}` });
    return mapRdContactToUnified(unwrap(response), await this.ownerLookup(ctx));
  }

  async createContact(ctx: ProviderContext, data: Partial<UnifiedContact>): Promise<UnifiedContact> {
    this.assertSupports('contacts', 'create');

    const response = await this.request(ctx, {
      method: 'POST',
      path: '/contacts',
      // RD wraps both the request and the response in `data`.
      body: { data: mapUnifiedContactToRd(data) },
    });

    return mapRdContactToUnified(unwrap(response), await this.ownerLookup(ctx));
  }

  async searchContacts(ctx: ProviderContext, match: RecordMatch): Promise<Page<UnifiedContact>> {
    this.assertSupports('contacts', 'search');

    const { data, nextCursor } = await this.searchPage(ctx, '/contacts', match, CONTACT_MATCH_FIELDS);
    const owners = await this.ownerLookup(ctx);

    return this.page(
      data.map((raw) => mapRdContactToUnified(raw, owners)),
      { nextCursor }
    );
  }

  /**
   * Create or update a contact, chosen by the match.
   *
   * RD has no upsert endpoint for the CRM, so this is a search followed by a
   * PUT or a POST. Two consequences worth knowing: it costs two calls, and it
   * is not atomic, so two callers upserting the same new contact at the same
   * moment can both create one. RD has no natural-key constraint to lean on.
   */
  async upsertContact(
    ctx: ProviderContext,
    match: RecordMatch,
    data: Partial<UnifiedContact>
  ): Promise<UpsertResult<UnifiedContact>> {
    this.assertSupports('contacts', 'upsert');

    const { data: found } = await this.searchPage(ctx, '/contacts', match, CONTACT_MATCH_FIELDS);

    // Picking the first of several would write to somebody's record at random.
    if (found.length > 1) {
      throw new ProviderError(
        'INVALID_REQUEST',
        `${match.field} "${match.value}" matches ${found.length} contacts. Use a match that identifies one.`,
        { provider: this.manifest.slug }
      );
    }

    // The write goes out before the owner names are fetched: reference data is
    // only needed to render the answer, and fetching it first would delay the
    // part that matters.
    if (found.length === 0) {
      const created = await this.request(ctx, {
        method: 'POST',
        path: '/contacts',
        body: { data: mapUnifiedContactToRd(this.withMatch(match, data)) },
      });
      return { record: mapRdContactToUnified(unwrap(created), await this.ownerLookup(ctx)), created: true };
    }

    // PUT /contacts/{id} is a partial update: only the fields sent are changed.
    const updated = await this.request(ctx, {
      method: 'PUT',
      path: `/contacts/${encodeURIComponent(found[0].id)}`,
      body: { data: mapUnifiedContactToRd(data) },
    });

    return { record: mapRdContactToUnified(unwrap(updated), await this.ownerLookup(ctx)), created: false };
  }

  /**
   * The matched value belongs in the record it creates.
   *
   * Upserting on an email that the payload does not repeat should still produce
   * a contact with that email, otherwise the next upsert creates another one.
   */
  private withMatch(match: RecordMatch, data: Partial<UnifiedContact>): Partial<UnifiedContact> {
    if (match.field === 'email' && !data.email && !data.emails?.length) {
      return { ...data, email: match.value };
    }
    if (match.field === 'phone' && !data.phones?.length) {
      return { ...data, phones: [match.value] };
    }
    return data;
  }

  /* ---------------------------------------------------------------- *
   * Companies, which RD calls organizations
   * ---------------------------------------------------------------- */

  async listCompanies(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedCompany>> {
    this.assertSupports('companies', 'list');

    const { data, nextCursor } = await this.listPage(ctx, '/organizations', params);
    const owners = await this.ownerLookup(ctx);

    return this.page(
      data.map((raw) => mapRdOrganizationToUnified(raw, owners)),
      { nextCursor }
    );
  }

  async getCompany(ctx: ProviderContext, id: string): Promise<UnifiedCompany> {
    this.assertSupports('companies', 'get');

    const response = await this.request(ctx, { method: 'GET', path: `/organizations/${encodeURIComponent(id)}` });
    return mapRdOrganizationToUnified(unwrap(response), await this.ownerLookup(ctx));
  }

  async createCompany(ctx: ProviderContext, data: Partial<UnifiedCompany>): Promise<UnifiedCompany> {
    this.assertSupports('companies', 'create');

    const response = await this.request(ctx, {
      method: 'POST',
      path: '/organizations',
      body: { data: mapUnifiedCompanyToRd(data) },
    });

    return mapRdOrganizationToUnified(unwrap(response), await this.ownerLookup(ctx));
  }

  /* ---------------------------------------------------------------- *
   * Deals
   * ---------------------------------------------------------------- */

  async listDeals(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedDeal>> {
    this.assertSupports('deals', 'list');

    const { data, nextCursor } = await this.listPage(ctx, '/deals', params);
    const [owners, stages] = await Promise.all([this.ownerLookup(ctx), this.stageLookup(ctx)]);

    return this.page(
      data.map((raw) => mapRdDealToUnified(raw, owners, stages)),
      { nextCursor }
    );
  }

  async getDeal(ctx: ProviderContext, id: string): Promise<UnifiedDeal> {
    this.assertSupports('deals', 'get');

    const response = await this.request(ctx, { method: 'GET', path: `/deals/${encodeURIComponent(id)}` });
    const [owners, stages] = await Promise.all([this.ownerLookup(ctx), this.stageLookup(ctx)]);

    return mapRdDealToUnified(unwrap(response), owners, stages);
  }

  async createDeal(ctx: ProviderContext, data: Partial<UnifiedDeal>): Promise<UnifiedDeal> {
    this.assertSupports('deals', 'create');

    const response = await this.request(ctx, {
      method: 'POST',
      path: '/deals',
      body: { data: mapUnifiedDealToRd(data) },
    });

    const [owners, stages] = await Promise.all([this.ownerLookup(ctx), this.stageLookup(ctx)]);
    return mapRdDealToUnified(unwrap(response), owners, stages);
  }

  /* ---------------------------------------------------------------- *
   * Pipelines
   * ---------------------------------------------------------------- */

  async listPipelines(ctx: ProviderContext, _params: ListParams): Promise<Page<UnifiedPipeline>> {
    this.assertSupports('pipelines', 'list');

    const { pipelines } = await this.funnel(ctx);

    // Funnels are account configuration, a handful of rows, so they arrive in
    // one page rather than making the caller walk a cursor.
    return this.page(
      pipelines.map((pipeline) => mapRdPipelineToUnified({ id: pipeline.id, name: pipeline.name }, pipeline.stages)),
      { totalItems: pipelines.length, nextCursor: null }
    );
  }

  /* ---------------------------------------------------------------- *
   * Shared plumbing
   * ---------------------------------------------------------------- */

  /** One page of any RD list endpoint, translated into our cursor scheme. */
  private async listPage(
    ctx: ProviderContext,
    path: string,
    params: ListParams
  ): Promise<{ data: any[]; nextCursor: string | null }> {
    const page = readPage(params.cursor);
    const size = Number(params.limit) > 0 ? Number(params.limit) : DEFAULT_PAGE_SIZE;

    const query: Record<string, string | number> = { 'page[number]': page, 'page[size]': size };

    // RDQL, which is `property:value` separated by spaces, combined with an
    // implicit AND. Only the two filters RD documents for these endpoints are
    // built here: a name match, and the last update time.
    const filters: string[] = [];
    if (params.search) filters.push(`name:~${params.search}`);
    if (params.updatedAfter) filters.push(`updated_at:>=${rdqlDateTime(params.updatedAfter)}`);
    if (filters.length > 0) query.filter = filters.join(' ');

    const response = await this.request<RdListResponse>(ctx, { method: 'GET', path, query });
    const data = Array.isArray(response?.data) ? response.data : [];

    // No total is returned anywhere in v2, so `links.next` is the only honest
    // signal that another page exists.
    const hasNext = Boolean(response?.links?.next);

    return { data, nextCursor: hasNext ? encodeCursor({ page: page + 1 }) : null };
  }

  /**
   * One page of an RD list endpoint filtered by a natural key.
   *
   * RDQL is `property:value` separated by spaces, and the properties a given
   * endpoint accepts are listed per endpoint in RD's reference. Anything else
   * is refused here rather than sent, because RD answers an unknown property
   * with every record rather than none, and a silent full-table match behind an
   * upsert is how the wrong person's record gets overwritten.
   */
  private async searchPage(
    ctx: ProviderContext,
    path: string,
    match: RecordMatch,
    allowed: readonly string[]
  ): Promise<{ data: any[]; nextCursor: string | null }> {
    const field = (match?.field ?? '').trim();
    const value = (match?.value ?? '').trim();

    if (!value) {
      throw new ProviderError('INVALID_REQUEST', 'A match needs a value.', { provider: this.manifest.slug });
    }

    // Custom fields are addressed with an @ prefix and vary per account, so they
    // cannot be checked against a list.
    const isCustomField = field.startsWith('@') && field.length > 1;
    if (!isCustomField && !allowed.includes(field)) {
      throw new ProviderError(
        'INVALID_REQUEST',
        `${this.manifest.name} cannot match contacts on "${field}". Use one of: ${allowed.join(', ')}, or @custom_field_slug.`,
        { provider: this.manifest.slug }
      );
    }

    // A space would start a second RDQL clause, so a value containing one is
    // refused rather than quietly turned into a different query.
    if (/\s/.test(value)) {
      throw new ProviderError(
        'INVALID_REQUEST',
        'A match value cannot contain spaces: RD Station reads them as another filter.',
        { provider: this.manifest.slug }
      );
    }

    const response = await this.request<RdListResponse>(ctx, {
      method: 'GET',
      path,
      query: { filter: `${field}:${value}`, 'page[number]': 1, 'page[size]': DEFAULT_PAGE_SIZE },
    });

    const data = Array.isArray(response?.data) ? response.data : [];
    const hasNext = Boolean(response?.links?.next);

    return { data, nextCursor: hasNext ? encodeCursor({ page: 2 }) : null };
  }

  /**
   * The account's users, so an owner id becomes a name. Fetched once per
   * provider instance, and a failure degrades to ids rather than failing the
   * whole call: a missing owner name is not worth a 500.
   */
  private async ownerLookup(ctx: ProviderContext): Promise<OwnerLookup> {
    this.ownersByIdPromise ??= this.loadOwners(ctx);
    const owners = await this.ownersByIdPromise;

    return (ownerId) => {
      if (!ownerId) return null;
      return owners.get(ownerId) ?? { id: ownerId, name: null, email: null };
    };
  }

  private async loadOwners(ctx: ProviderContext): Promise<Map<string, UnifiedOwner>> {
    try {
      const response = await this.request<RdListResponse>(ctx, {
        method: 'GET',
        path: '/users',
        query: { 'page[size]': 100 },
      });

      const entries = (Array.isArray(response?.data) ? response.data : []).map((user: any) => [
        String(user?.id ?? ''),
        { id: String(user?.id ?? ''), name: user?.name ?? null, email: user?.email ?? null },
      ]);

      return new Map(entries as [string, UnifiedOwner][]);
    } catch (error) {
      console.warn('[RD_STATION_CRM] could not load users, owners will carry ids only:', (error as Error).message);
      return new Map();
    }
  }

  /** Stage id to its name and pipeline, for the same reason as owners. */
  private async stageLookup(ctx: ProviderContext): Promise<StageLookup> {
    const { stageIndex } = await this.funnel(ctx);

    return (stageId) => {
      if (!stageId) return null;
      const found = stageIndex.get(stageId);
      return found ? { pipelineId: found.pipelineId, pipelineName: found.pipelineName, stageName: found.stageName } : null;
    };
  }

  /**
   * Pipelines with their stages.
   *
   * v2 has no endpoint for every stage at once, so stages are walked pipeline
   * by pipeline. Accounts have a handful of funnels (the client this was built
   * for has one), and this runs at most once per request.
   */
  private async funnel(ctx: ProviderContext) {
    this.funnelPromise ??= this.loadFunnel(ctx);
    return this.funnelPromise;
  }

  private async loadFunnel(ctx: ProviderContext) {
    const stageIndex = new Map<string, { pipelineId: string; pipelineName: string; stageName: string }>();

    try {
      const response = await this.request<RdListResponse>(ctx, {
        method: 'GET',
        path: '/pipelines',
        query: { 'page[size]': 100 },
      });

      const rows = Array.isArray(response?.data) ? response.data : [];

      const pipelines = await Promise.all(
        rows.map(async (pipeline: any) => {
          const pipelineId = String(pipeline?.id ?? '');
          const pipelineName = String(pipeline?.name ?? '');

          const stagesResponse = await this.request<RdListResponse>(ctx, {
            method: 'GET',
            path: `/pipelines/${encodeURIComponent(pipelineId)}/stages`,
            query: { 'page[size]': 100, 'sort[order]': 'asc' },
          });

          const stages = (Array.isArray(stagesResponse?.data) ? stagesResponse.data : []).map((stage: any) => ({
            id: String(stage?.id ?? ''),
            name: String(stage?.name ?? ''),
            order: Number(stage?.order),
          }));

          // A stage never carries its pipeline id back, so the association is
          // only knowable here, from the path that was requested.
          for (const stage of stages) {
            stageIndex.set(stage.id, { pipelineId, pipelineName, stageName: stage.name });
          }

          return { id: pipelineId, name: pipelineName, stages };
        })
      );

      return { pipelines, stageIndex };
    } catch (error) {
      console.warn('[RD_STATION_CRM] could not load pipelines, stage names will be absent:', (error as Error).message);
      return { pipelines: [], stageIndex };
    }
  }
}

/** Both single-record responses and creates arrive wrapped in `data`. */
function unwrap(response: any): any {
  return response && typeof response === 'object' && 'data' in response ? response.data : response;
}
