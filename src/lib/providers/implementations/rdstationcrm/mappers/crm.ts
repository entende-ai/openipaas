import {
  UnifiedCompanySchema,
  UnifiedContactSchema,
  UnifiedDealSchema,
  UnifiedPipelineSchema,
} from '@/lib/validations/unified-schemas';
import type {
  UnifiedCompany,
  UnifiedContact,
  UnifiedDeal,
  UnifiedDealStatus,
  UnifiedOwner,
  UnifiedPipeline,
} from '@/types/unified';

/**
 * RD Station CRM v2 -> unified CRM.
 *
 * Every mapper finishes with a Zod parse: if RD changes its contract, this is
 * where it fails, not somewhere downstream.
 *
 * Shapes that drove these decisions, from the v2 reference:
 *   - emails are `[{ email }]` and phones are `[{ phone, type }]`;
 *   - a contact points at one organization by id, and carries no owner;
 *   - a deal has no single value: `recurrence_price` plus `one_time_price`,
 *     with a read only `total_price`;
 *   - a deal holds `contact_ids`, an array, even though the filter is singular;
 *   - `pipeline_id` on a deal is read only and derived from `stage_id`;
 *   - stages come back without their pipeline id, so the caller has to
 *     remember which pipeline it asked about.
 */

const SLUG = 'RD_STATION_CRM';

/** RD sends ids as 24 character hex; everything downstream wants strings. */
function id(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function text(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function isoOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The account's own users, looked up once per request by the provider. RD
 * returns only an id on the record, and an id is not something a person can
 * read off a screen.
 */
export type OwnerLookup = (ownerId: string | null) => UnifiedOwner | null;

export const noOwners: OwnerLookup = (ownerId) =>
  ownerId ? { id: ownerId, name: null, email: null } : null;

export function mapRdContactToUnified(raw: any, owners: OwnerLookup = noOwners): UnifiedContact {
  const emails: string[] = Array.isArray(raw?.emails)
    ? raw.emails.map((entry: any) => text(entry?.email)).filter((value: string | null): value is string => Boolean(value))
    : [];

  const phones: string[] = Array.isArray(raw?.phones)
    ? raw.phones.map((entry: any) => text(entry?.phone)).filter((value: string | null): value is string => Boolean(value))
    : [];

  return UnifiedContactSchema.parse({
    id: String(raw?.id ?? ''),
    name: text(raw?.name) ?? '',
    email: emails[0] ?? null,
    emails,
    phones,
    title: text(raw?.job_title),
    companyId: id(raw?.organization_id),
    // RD does not embed the organization, and fetching one per contact would
    // turn a page of 25 into 26 requests.
    companyName: null,
    // Contacts carry no owner_id in v2; only organizations and deals do.
    owner: owners(null),
    customFields: customFields(raw?.custom_fields),
    createdAt: isoOrNull(raw?.created_at) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(raw?.updated_at),
    remoteData: { provider: SLUG, raw },
  });
}

/**
 * The fields the account added itself.
 *
 * This is where most of what an RD account actually uses lives: the columns
 * somebody created because the built-in ones did not fit. Reaching them used
 * to mean reading `remoteData.raw`, which undoes the point of a unified layer,
 * so they come through as a list.
 *
 * The keys are RD's own slugs, hyphens and all (`log-de-contatos`). They are
 * not normalized: a slug is how the account names the column, and rewriting it
 * would mean two names for one thing with no way back to the original.
 *
 * `label` stays null. RD sends the values keyed by slug and says nothing about
 * what each column is called, and inventing a label from a slug would be
 * guessing at somebody else's wording.
 */
function customFields(raw: unknown): { key: string; label: string | null; value: string | null }[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];

  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
    key,
    label: null,
    value: customFieldValue(value),
  }));
}

/**
 * One value, as a string or null.
 *
 * RD custom fields can be text, a number, a date, a boolean or a multi-select.
 * A list is joined with ", " so the common case reads as a person wrote it;
 * anything with a shape of its own is left to `remoteData.raw`, because a
 * JSON blob in a string field is not a value anyone can use.
 */
function customFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const parts = value.map(customFieldValue).filter((entry): entry is string => entry !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (typeof value === 'object') return null;

  return text(String(value));
}

/**
 * The document lives in a custom field, because RD has no CNPJ column. The
 * slug is whatever the account named it, so this looks for the usual ones and
 * gives up rather than guessing.
 */
function documentFromCustomFields(customFields: unknown): string | null {
  if (!customFields || typeof customFields !== 'object') return null;

  for (const [key, value] of Object.entries(customFields as Record<string, unknown>)) {
    if (/^(cnpj|cpf|documento|document)$/i.test(key)) {
      const digits = String(value ?? '').replace(/\D/g, '');
      if (digits.length > 0) return digits;
    }
  }
  return null;
}

export function mapRdOrganizationToUnified(raw: any, owners: OwnerLookup = noOwners): UnifiedCompany {
  return UnifiedCompanySchema.parse({
    id: String(raw?.id ?? ''),
    name: text(raw?.name) ?? '',
    document: documentFromCustomFields(raw?.custom_fields),
    website: text(raw?.url),
    customFields: customFields(raw?.custom_fields),
    // Organizations have no phone field in v2.
    phones: [],
    owner: owners(id(raw?.owner_id)),
    createdAt: isoOrNull(raw?.created_at) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(raw?.updated_at),
    remoteData: { provider: SLUG, raw },
  });
}

/** `paused` is still in play, so it stays open rather than inventing a state. */
export function mapRdDealStatus(status: unknown): UnifiedDealStatus {
  switch (String(status ?? '').toLowerCase()) {
    case 'won':
      return 'WON';
    case 'lost':
      return 'LOST';
    case 'ongoing':
    case 'paused':
      return 'OPEN';
    default:
      return 'UNKNOWN';
  }
}

/** A finite number, or null. `Number(null)` is 0, which is why this is not `Number`. */
function money(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Money on an RD deal is two numbers plus a derived total, and a deal with no
 * value at all is null rather than zero.
 *
 * `total_price` is read only and RD sends it on every deal, so "is it present"
 * cannot separate a deal worth nothing from a deal nobody priced: both arrive
 * as 0, alongside `one_time_price` and `recurrence_price` also at 0. Only a
 * non-zero number carries information, so that is what is trusted, and when
 * every number is zero or missing the answer is null.
 *
 * The cost of that choice: a deal genuinely worth zero also reads as null.
 * That is the side worth being wrong on, because null says "RD does not know"
 * and 0 says "RD says nothing", and only one of those is true here.
 */
export function dealAmount(raw: any): number | null {
  const total = money(raw?.total_price);
  if (total !== null && total !== 0) return total;

  const parts = [money(raw?.recurrence_price), money(raw?.one_time_price)].filter(
    (value): value is number => value !== null && value !== 0
  );

  return parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) : null;
}

export interface StageLookup {
  (stageId: string | null): { pipelineId: string | null; pipelineName: string | null; stageName: string | null } | null;
}

export const noStages: StageLookup = () => null;

export function mapRdDealToUnified(raw: any, owners: OwnerLookup = noOwners, stages: StageLookup = noStages): UnifiedDeal {
  const stageId = id(raw?.stage_id);
  const funnel = stages(stageId);

  return UnifiedDealSchema.parse({
    id: String(raw?.id ?? ''),
    name: text(raw?.name) ?? '',
    status: mapRdDealStatus(raw?.status),
    amount: dealAmount(raw),
    // RD documents no currency on a deal, and the account's currency is not
    // exposed, so claiming BRL here would be a guess.
    currency: null,
    pipelineId: id(raw?.pipeline_id) ?? funnel?.pipelineId ?? null,
    pipelineName: funnel?.pipelineName ?? null,
    stageId,
    stageName: funnel?.stageName ?? null,
    companyId: id(raw?.organization_id),
    companyName: null,
    contactIds: Array.isArray(raw?.contact_ids) ? raw.contact_ids.map((value: unknown) => String(value)) : [],
    owner: owners(id(raw?.owner_id)),
    customFields: customFields(raw?.custom_fields),
    closedAt: isoOrNull(raw?.closed_at),
    createdAt: isoOrNull(raw?.created_at) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(raw?.updated_at),
    remoteData: { provider: SLUG, raw },
  });
}

export function mapRdPipelineToUnified(raw: any, stages: any[]): UnifiedPipeline {
  return UnifiedPipelineSchema.parse({
    id: String(raw?.id ?? ''),
    name: text(raw?.name) ?? '',
    stages: stages
      .map((stage: any, index: number) => ({
        id: String(stage?.id ?? ''),
        name: text(stage?.name) ?? '',
        // RD numbers stages from 1, but a missing order must not collapse
        // every stage onto the same position.
        order: Number.isFinite(Number(stage?.order)) ? Number(stage.order) : index + 1,
      }))
      .sort((a, b) => a.order - b.order),
    remoteData: { provider: SLUG, raw },
  });
}

/* ------------------------------------------------------------------ *
 * Unified -> RD, for writes
 * ------------------------------------------------------------------ */

export function mapUnifiedContactToRd(data: Partial<UnifiedContact>): Record<string, unknown> {
  const emails = data.emails?.length ? data.emails : data.email ? [data.email] : [];

  const payload: Record<string, unknown> = { name: data.name };
  if (emails.length > 0) payload.emails = emails.map((email) => ({ email }));
  if (data.phones?.length) payload.phones = data.phones.map((phone) => ({ phone, type: 'work' }));
  if (data.title) payload.job_title = data.title;
  if (data.companyId) payload.organization_id = data.companyId;

  return payload;
}

export function mapUnifiedCompanyToRd(data: Partial<UnifiedCompany>): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: data.name };
  if (data.website) payload.url = data.website;
  if (data.owner?.id) payload.owner_id = data.owner.id;

  // `document` is deliberately not written: it lives in a custom field whose
  // slug differs per account, and inventing one fails the whole create.
  return payload;
}

export function mapUnifiedDealToRd(data: Partial<UnifiedDeal>): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: data.name, status: 'ongoing' };

  // A deal joins a funnel through its stage: pipeline_id is read only.
  if (data.stageId) payload.stage_id = data.stageId;
  if (data.companyId) payload.organization_id = data.companyId;
  if (data.contactIds?.length) payload.contact_ids = data.contactIds;
  if (data.owner?.id) payload.owner_id = data.owner.id;
  if (typeof data.amount === 'number') payload.one_time_price = data.amount;

  return payload;
}
