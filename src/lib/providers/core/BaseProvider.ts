import { httpRequest } from './http';
import { acquireSlot } from './rate-limit';
import { NotSupportedError, ProviderError, TokenExpiredError } from './errors';
import type {
  Operation,
  Page,
  ProviderContext,
  ProviderManifest,
  ResourceName,
  UnifiedProvider,
} from './types';

/**
 * Persists a renewed credential and returns the fresh tokens. `ctx.accessToken`
 * is the token the caller found expired, which is how the refresher tells a
 * stale caller from one whose token was already replaced.
 */
export type TokenRefresher = (
  ctx: ProviderContext
) => Promise<{ accessToken: string; refreshToken?: string | null; expiresAt?: Date | null }>;

/**
 * How long before its stated expiry a token is renewed. Renewing early spares
 * every request that would otherwise hit the expiry together a failed call and a
 * replay.
 */
export const EARLY_RENEWAL_MARGIN_MS = 60_000;

export interface ProviderDeps {
  fetchImpl?: typeof fetch;
  /** Injected by the registry; absent in unit tests that never hit a 401. */
  refreshCredential?: TokenRefresher;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
  now?: () => number;
}

export interface ProviderRequest {
  method: string;
  path: string;
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  responseType?: 'json' | 'binary';
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Everything a provider gets for free: URL building, per-account rate limiting,
 * retry with backoff, refresh-and-replay on 401, capability checks and
 * passthrough. Implementations should only need mappers plus endpoint paths.
 */
export abstract class BaseProvider implements UnifiedProvider {
  abstract readonly manifest: ProviderManifest;

  /**
   * Tokens renewed during this instance's life, by credential. A provider is
   * built per API request, so this lets the remaining calls of a paginated or
   * multi-step operation use the new token instead of each rediscovering the
   * expiry.
   */
  private readonly renewed = new Map<string, { accessToken: string; expiresAt: Date | null }>();

  constructor(protected readonly deps: ProviderDeps = {}) {}

  /* -------------------------------------------------- capabilities */

  supports(resource: ResourceName, operation: Operation): boolean {
    const ops = this.manifest.capabilities[resource];
    return Array.isArray(ops) && ops.includes(operation);
  }

  protected assertSupports(resource: ResourceName, operation: Operation): void {
    if (!this.supports(resource, operation)) {
      throw new NotSupportedError(this.manifest.slug, resource, operation);
    }
  }

  /* -------------------------------------------------- urls */

  /**
   * Resolves the account-specific root. `instanceUrl` wins when the provider is
   * per-tenant hosted (Salesforce, Shopify); `{tenantId}` is interpolated for
   * providers that carry the tenant in the path (Nuvemshop).
   */
  protected resolveBaseUrl(ctx: ProviderContext): string {
    const root = ctx.instanceUrl?.trim() || this.manifest.baseUrl;
    return root.replace('{tenantId}', ctx.externalTenantId ?? '').replace(/\/+$/, '');
  }

  protected buildUrl(ctx: ProviderContext, path: string, query?: ProviderRequest['query']): string {
    if (!path.startsWith('/')) {
      throw new ProviderError('INVALID_REQUEST', 'Request path must start with "/".', {
        provider: this.manifest.slug,
      });
    }
    const url = new URL(this.resolveBaseUrl(ctx) + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /** Overridden by providers that do not use bearer tokens. */
  protected authHeaders(ctx: ProviderContext): Record<string, string> {
    return { Authorization: `Bearer ${ctx.accessToken}` };
  }

  /* -------------------------------------------------- requests */

  /**
   * Rate-limited, retried request. A token close to its stated expiry is renewed
   * first; on 401 the credential is refreshed once and the exact same call is
   * replayed with the new token.
   */
  protected async request<T = any>(ctx: ProviderContext, req: ProviderRequest): Promise<T> {
    const attempt = async (accessToken: string): Promise<T> => {
      const scopedCtx = { ...ctx, accessToken };
      await acquireSlot(
        `${this.manifest.slug}:${ctx.credentialId}`,
        this.manifest.rateLimit,
        this.deps.sleep
      );

      const { body } = await httpRequest(
        {
          method: req.method,
          url: this.buildUrl(scopedCtx, req.path, req.query),
          headers: {
            Accept: 'application/json',
            ...(req.body !== undefined && req.body !== null ? { 'Content-Type': 'application/json' } : {}),
            ...this.authHeaders(scopedCtx),
            ...req.headers,
          },
          body: req.body,
          responseType: req.responseType,
          timeoutMs: req.timeoutMs,
        },
        {
          provider: this.manifest.slug,
          fetchImpl: this.deps.fetchImpl,
          sleep: this.deps.sleep,
          random: this.deps.random,
          maxAttempts: this.deps.maxAttempts,
        }
      );

      return body as T;
    };

    let token = this.renewed.get(ctx.credentialId)?.accessToken ?? ctx.accessToken;

    if (this.deps.refreshCredential && this.expiresSoon(ctx)) {
      try {
        token = await this.renew(ctx, token);
      } catch (err) {
        // The current token still has up to the margin left, so try it; if it
        // is refused, the 401 path below gets a second chance to renew.
        console.warn(`[${this.manifest.slug}] early renewal of ${ctx.credentialId} failed: ${(err as Error).message}`);
      }
    }

    try {
      return await attempt(token);
    } catch (err) {
      if (!(err instanceof TokenExpiredError)) throw err;
      if (!this.deps.refreshCredential) throw err;

      console.log(`[${this.manifest.slug}] 401 received; refreshing credential ${ctx.credentialId}`);
      const fresh = await this.renew(ctx, token);
      console.log(`[${this.manifest.slug}] refresh succeeded; replaying request`);
      return await attempt(fresh);
    }
  }

  private expiresSoon(ctx: ProviderContext): boolean {
    // A renewal recorded here supersedes what the request started with, even
    // when the provider gave no expiry for the new token.
    const renewed = this.renewed.get(ctx.credentialId);
    const expiresAt = renewed ? renewed.expiresAt : ctx.expiresAt;
    if (!expiresAt) return false;

    const now = this.deps.now?.() ?? Date.now();
    return expiresAt.getTime() - now < EARLY_RENEWAL_MARGIN_MS;
  }

  /** `staleToken` is the one actually in use, so the refresher can tell it was replaced. */
  private async renew(ctx: ProviderContext, staleToken: string): Promise<string> {
    const renewed = await this.deps.refreshCredential!({ ...ctx, accessToken: staleToken });
    this.renewed.set(ctx.credentialId, { accessToken: renewed.accessToken, expiresAt: renewed.expiresAt ?? null });
    return renewed.accessToken;
  }

  protected async requestBinary(ctx: ProviderContext, req: Omit<ProviderRequest, 'responseType'>): Promise<ArrayBuffer> {
    return this.request<ArrayBuffer>(ctx, { ...req, responseType: 'binary' });
  }

  /* -------------------------------------------------- passthrough */

  /**
   * Raw upstream access with our auth, throttling and retries applied. Lets a
   * provider be useful before its unified mappers exist.
   */
  async passthrough(
    ctx: ProviderContext,
    req: { method: string; path: string; query?: Record<string, string>; body?: unknown }
  ): Promise<{ status: number; body: unknown }> {
    if (!this.manifest.passthrough) {
      throw new NotSupportedError(this.manifest.slug, 'passthrough', req.method);
    }

    const path = normalizePassthroughPath(req.path, this.manifest.slug);
    const body = await this.request(ctx, { method: req.method, path, query: req.query, body: req.body });
    return { status: 200, body };
  }

  /* -------------------------------------------------- helpers */

  protected page<T>(items: T[], opts: { totalItems?: number; nextCursor?: string | null } = {}): Page<T> {
    const nextCursor = opts.nextCursor ?? null;
    return { items, nextCursor, hasMore: nextCursor !== null, totalItems: opts.totalItems };
  }
}

/**
 * Keeps a caller-supplied passthrough path inside the provider's own host:
 * rejects absolute URLs, protocol-relative paths and traversal segments.
 */
export function normalizePassthroughPath(rawPath: string, provider: string): string {
  const path = (rawPath || '').trim();

  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ProviderError('INVALID_REQUEST', 'Passthrough path must be relative and start with a single "/".', {
      provider,
    });
  }
  if (/^\/+\w+:/.test(path) || path.includes('://')) {
    throw new ProviderError('INVALID_REQUEST', 'Passthrough path must not contain an absolute URL.', { provider });
  }
  if (path.split('/').includes('..')) {
    throw new ProviderError('INVALID_REQUEST', 'Passthrough path must not contain ".." segments.', { provider });
  }
  return path;
}
