import { ProviderError, RateLimitError, TokenExpiredError, UpstreamError } from './errors';

export interface HttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** 'json' parses the response, 'binary' returns an ArrayBuffer. */
  responseType?: 'json' | 'binary';
  timeoutMs?: number;
}

export interface HttpOptions {
  provider: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable jitter source; defaults to Math.random. */
  random?: () => number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds)) return asSeconds * 1000;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

/** Exponential backoff with full jitter, so retries from many workers spread out. */
function backoffMs(attempt: number, base: number, max: number, random: () => number): number {
  const exponential = Math.min(max, base * 2 ** (attempt - 1));
  return Math.floor(random() * exponential);
}

/**
 * Single HTTP call with timeout, no retry. Translates transport and status
 * failures into ProviderError subclasses.
 */
async function performRequest(req: HttpRequest, opts: HttpOptions): Promise<{ status: number; body: any }> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body === undefined || req.body === null ? undefined : JSON.stringify(req.body),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ProviderError('UPSTREAM_TIMEOUT', `The ${opts.provider} API did not respond in time.`, {
        provider: opts.provider,
        retryable: true,
      });
    }
    throw new ProviderError('UPSTREAM_ERROR', `Could not reach the ${opts.provider} API.`, {
      provider: opts.provider,
      details: err?.message,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    throw new TokenExpiredError(opts.provider);
  }

  if (res.status === 429) {
    throw new RateLimitError(opts.provider, parseRetryAfterMs(res.headers?.get?.('Retry-After') ?? null));
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Upstream payloads stay in the log, never in the client response.
    console.error(`[${opts.provider}] HTTP ${res.status} on ${req.method} ${req.url} :: ${detail.slice(0, 500)}`);
    if (res.status === 404) {
      throw new ProviderError('NOT_FOUND', 'The requested record was not found in the connected account.', {
        provider: opts.provider,
        details: detail,
      });
    }
    if (res.status >= 400 && res.status < 500) {
      throw new ProviderError('INVALID_REQUEST', `The ${opts.provider} API rejected the request (HTTP ${res.status}).`, {
        provider: opts.provider,
        details: detail,
        status: res.status,
      });
    }
    throw new UpstreamError(opts.provider, res.status, detail);
  }

  if (req.responseType === 'binary') {
    return { status: res.status, body: await res.arrayBuffer() };
  }

  const text = await res.text();
  if (!text) return { status: res.status, body: null };
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: { raw: text } };
  }
}

/**
 * Performs an HTTP request, retrying transient failures (429, 5xx, timeouts)
 * with exponential backoff. Never retries 4xx or TOKEN_EXPIRED — the caller
 * handles refresh, since retrying with the same dead token is pointless.
 */
export async function httpRequest(req: HttpRequest, opts: HttpOptions): Promise<{ status: number; body: any }> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 300;
  const maxDelayMs = opts.maxDelayMs ?? 8_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await performRequest(req, opts);
    } catch (err) {
      lastError = err;

      const isRetryable = err instanceof ProviderError && err.retryable;
      if (!isRetryable || attempt === maxAttempts) throw err;

      const retryAfter = err instanceof RateLimitError ? err.retryAfterMs : undefined;
      const delay = retryAfter ?? backoffMs(attempt, baseDelayMs, maxDelayMs, random);
      console.warn(`[${opts.provider}] attempt ${attempt}/${maxAttempts} failed (${(err as ProviderError).code}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError;
}
