import type {
  UnifiedCustomer,
  UnifiedProduct,
  UnifiedSale,
  UnifiedSeller,
  UnifiedCategory,
  UnifiedBrand,
  UnifiedUnit,
} from '@/types/unified';

/* ------------------------------------------------------------------ *
 * Catalog taxonomy
 * ------------------------------------------------------------------ */

/**
 * Unified models are defined per category: an accounting system and a CRM do not
 * share a common "sale". A provider belongs to exactly one category.
 */
export type ProviderCategory = 'ACCOUNTING' | 'ECOMMERCE' | 'CRM' | 'PAYMENTS' | 'FISCAL' | 'HRIS';

export type ResourceName =
  | 'customers'
  | 'products'
  | 'categories'
  | 'brands'
  | 'units'
  | 'sales'
  | 'sellers';

export type Operation =
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'delete'
  | 'bulkDelete'
  | 'bulkActivate'
  | 'bulkDeactivate'
  | 'pdf';

/** Declared, not discovered at runtime: what a provider can actually do. */
export type CapabilityMap = Partial<Record<ResourceName, readonly Operation[]>>;

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export type AuthType = 'OAUTH2' | 'API_KEY' | 'CUSTOM';

/** One input rendered in the "connect account" UI. */
export interface CredentialField {
  key: string;
  label: string;
  required: boolean;
  /** Masked in the UI and never returned by the API. */
  secret: boolean;
  help?: string;
}

export interface OAuth2AuthConfig {
  type: 'OAUTH2';
  authorizationUrl: string;
  tokenUrl: string;
  scopes: readonly string[];
  /** Conta Azul style: client_id:client_secret sent as an Authorization: Basic header. */
  tokenEndpointAuth: 'basic' | 'body';
  /** Send an S256 code challenge. Off by default: not every provider accepts it. */
  pkce?: boolean;
  /** Extra non-OAuth values the provider needs (e.g. a store id). */
  extraFields?: readonly CredentialField[];
}

export interface StaticAuthConfig {
  type: 'API_KEY' | 'CUSTOM';
  fields: readonly CredentialField[];
}

export type AuthConfig = OAuth2AuthConfig | StaticAuthConfig;

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

export interface ProviderManifest {
  /** Stable identifier stored in LinkedAccount.provider. */
  slug: string;
  name: string;
  category: ProviderCategory;
  description: string;
  logo?: string;
  docsUrl?: string;
  /** Root URL every relative request path is resolved against. */
  baseUrl: string;
  auth: AuthConfig;
  /** Upstream limit we throttle ourselves to, per connected account. */
  rateLimit?: { requestsPerSecond: number; burst?: number };
  capabilities: CapabilityMap;
  /** Whether the raw upstream API is exposed through /passthrough. */
  passthrough: boolean;
  /** false while the provider is still a stub. */
  enabled: boolean;
}

/* ------------------------------------------------------------------ *
 * Runtime context
 * ------------------------------------------------------------------ */

/**
 * Everything a provider needs to talk to one connected account. Built by the
 * auth layer from the stored (decrypted) credential.
 */
export interface ProviderContext {
  /** OAuthCredential.id, needed to persist a refreshed token. */
  credentialId: string;
  provider: string;
  accessToken: string;
  refreshToken?: string | null;
  /** Per-tenant host, e.g. a Salesforce instance_url or a Shopify shop domain. */
  instanceUrl?: string | null;
  /** Per-tenant path segment, e.g. a Nuvemshop store id. */
  externalTenantId?: string | null;
  /** Remaining decrypted credential fields (app_key, app_secret, ...). */
  secrets: Record<string, string>;
}

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

/**
 * Superset of page- and cursor-based pagination.
 *
 * `totalItems` is optional on purpose: cursor-based APIs (Shopify, HubSpot,
 * Stripe) cannot report a total, so consumers must rely on `hasMore`.
 */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  totalItems?: number;
}

export interface ListParams {
  /** Opaque cursor returned by the previous page. */
  cursor?: string;
  limit?: number;
  search?: string;
  /** ISO-8601; providers that support it return only records changed since. */
  updatedAfter?: string;
  /** Anything else is forwarded to the upstream API untouched. */
  [key: string]: unknown;
}

export function emptyPage<T>(): Page<T> {
  return { items: [], hasMore: false, nextCursor: null, totalItems: 0 };
}

/* ------------------------------------------------------------------ *
 * Domain modules
 *
 * Split per resource so a provider only implements what its API actually has.
 * A CRM has no products; a payment gateway has no sellers.
 * ------------------------------------------------------------------ */

export interface CustomerModule {
  listCustomers(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedCustomer>>;
  getCustomer?(ctx: ProviderContext, id: string): Promise<UnifiedCustomer>;
  createCustomer?(ctx: ProviderContext, data: Partial<UnifiedCustomer>): Promise<UnifiedCustomer>;
  updateCustomer?(ctx: ProviderContext, id: string, data: Partial<UnifiedCustomer>): Promise<UnifiedCustomer>;
  bulkActivateCustomers?(ctx: ProviderContext, ids: string[]): Promise<BulkResult>;
  bulkDeactivateCustomers?(ctx: ProviderContext, ids: string[]): Promise<BulkResult>;
  bulkDeleteCustomers?(ctx: ProviderContext, ids: string[]): Promise<BulkResult>;
}

export interface ProductModule {
  listProducts(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedProduct>>;
  getProduct?(ctx: ProviderContext, id: string): Promise<UnifiedProduct>;
  createProduct?(ctx: ProviderContext, data: Partial<UnifiedProduct>): Promise<UnifiedProduct>;
  updateProduct?(ctx: ProviderContext, id: string, data: Partial<UnifiedProduct>): Promise<UnifiedProduct>;
  deleteProduct?(ctx: ProviderContext, id: string): Promise<void>;
  listCategories?(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedCategory>>;
  listBrands?(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedBrand>>;
  listUnits?(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedUnit>>;
}

export interface SalesModule {
  listSales(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedSale>>;
  getSale?(ctx: ProviderContext, id: string): Promise<UnifiedSale>;
  createSale?(ctx: ProviderContext, data: Partial<UnifiedSale>): Promise<UnifiedSale>;
  getSalePdf?(ctx: ProviderContext, id: string): Promise<ArrayBuffer>;
  bulkDeleteSales?(ctx: ProviderContext, ids: string[]): Promise<BulkResult>;
  listSellers?(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedSeller>>;
}

export interface BulkResult {
  processedCount: number;
  ignoredCount: number;
}

/** Raw upstream access with our credential handling applied. */
export interface PassthroughModule {
  passthrough(
    ctx: ProviderContext,
    req: { method: string; path: string; query?: Record<string, string>; body?: unknown }
  ): Promise<{ status: number; body: unknown }>;
}

export interface UnifiedProvider
  extends Partial<CustomerModule>,
    Partial<ProductModule>,
    Partial<SalesModule>,
    Partial<PassthroughModule> {
  readonly manifest: ProviderManifest;
}
