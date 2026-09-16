import type { ProviderManifest, ResourceName } from '@/lib/providers/core/types';

/**
 * What the playground offers for a given connection.
 *
 * It used to offer exactly one thing, GET /customers, for every provider. A
 * passthrough-only provider such as RD Station CRM could therefore only ever
 * answer 501: the button promised a test and delivered a guaranteed error.
 */

export interface PlaygroundOperation {
  /** Stable id the form posts back. */
  id: string;
  label: string;
  method: 'GET';
  /** The unified path this maps to, shown so the developer learns the API. */
  path: string;
  resource: ResourceName;
}

const LISTABLE: { resource: ResourceName; label: string; path: string }[] = [
  { resource: 'customers', label: 'List customers', path: '/customers' },
  { resource: 'products', label: 'List products', path: '/products' },
  { resource: 'categories', label: 'List categories', path: '/products/categories' },
  { resource: 'brands', label: 'List brands', path: '/products/brands' },
  { resource: 'units', label: 'List units', path: '/products/units' },
  { resource: 'sales', label: 'List sales', path: '/sales' },
  { resource: 'sellers', label: 'List sellers', path: '/sales/sellers' },
];

/** Only what the manifest declares, so the list never promises a 501. */
export function playgroundOperations(manifest: ProviderManifest): PlaygroundOperation[] {
  return LISTABLE.filter(({ resource }) => (manifest.capabilities[resource] ?? []).includes('list')).map(
    ({ resource, label, path }) => ({ id: `list:${resource}`, label, method: 'GET' as const, path, resource })
  );
}

/**
 * The raw upstream path for a passthrough call.
 *
 * Relative only: an absolute URL would send the account's token to whatever
 * host was typed, which is the one thing this must never do.
 */
export function normalizePassthroughPath(raw: string): { path: string } | { error: string } {
  const value = (raw ?? '').trim();

  if (!value) return { error: 'Enter a path, for example /contacts.' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
    return { error: 'Use a path relative to the provider, not a full URL.' };
  }

  const path = value.startsWith('/') ? value : `/${value}`;

  if (path.split('?')[0].split('/').includes('..')) {
    return { error: 'The path cannot contain "..".' };
  }

  return { path };
}

/**
 * The playground reads and never writes.
 *
 * A stray POST from a test console lands in a real customer's CRM, so the
 * method is fixed rather than offered. Writes belong in the API, with an
 * idempotency key and a developer who meant it.
 */
export const PLAYGROUND_METHOD = 'GET' as const;

/** True when the provider answered fine but there is nothing in there. */
export function isEmptyResult(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (!data || typeof data !== 'object') return false;

  const record = data as Record<string, unknown>;

  // Unified pages and the shapes providers use for a list of nothing.
  if (Array.isArray(record.items)) return record.items.length === 0;
  if (Array.isArray(record.data)) return record.data.length === 0;
  if (Array.isArray(record.sample)) return record.sample.length === 0;

  return false;
}

/**
 * One sentence about what just happened.
 *
 * A raw 404 or an empty array means nothing to someone who has not read the
 * provider's API reference, and this screen is where they find out.
 */
export function explainResult(input: {
  status: number;
  providerName: string;
  data?: unknown;
  error?: string;
  path?: string;
}): string {
  const where = input.path ? ` at ${input.path}` : '';

  if (input.status >= 200 && input.status < 300) {
    return isEmptyResult(input.data)
      ? `It worked. ${input.providerName} has no records${where} on this account yet.`
      : 'It worked, and the response is below.';
  }

  switch (input.status) {
    case 400:
      return `${input.providerName} rejected the request${where}. Check the path and its parameters.`;
    case 401:
    case 403:
      return `${input.providerName} refused the stored credentials. Disconnect and connect the account again.`;
    case 404:
      return `${input.providerName} has no such path${where}. Check their API reference for the exact one.`;
    case 429:
      return `${input.providerName} is rate limiting us. Wait a moment and try again.`;
    case 501:
      return 'This operation is not implemented for this provider yet.';
    default:
      return input.status >= 500
        ? `${input.providerName} failed to answer. That is on their side, so try again in a moment.`
        : 'The request did not go through.';
  }
}
