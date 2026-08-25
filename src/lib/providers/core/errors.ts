/**
 * Typed errors shared by every provider.
 *
 * Routes map these to HTTP responses, which is what keeps raw upstream payloads
 * from leaking to our clients: only `publicMessage` is ever serialized.
 */

export type ProviderErrorCode =
  | 'TOKEN_EXPIRED'
  | 'NOT_SUPPORTED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'MAPPING_ERROR'
  | 'CONFIG_ERROR';

const STATUS_BY_CODE: Record<ProviderErrorCode, number> = {
  TOKEN_EXPIRED: 401,
  NOT_SUPPORTED: 501,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  UPSTREAM_TIMEOUT: 504,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  MAPPING_ERROR: 502,
  CONFIG_ERROR: 500,
};

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number;
  readonly provider?: string;
  readonly retryable: boolean;
  /** Raw upstream detail. Logged, never returned to the caller. */
  readonly details?: unknown;

  constructor(
    code: ProviderErrorCode,
    message: string,
    opts: { provider?: string; details?: unknown; retryable?: boolean; status?: number } = {}
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = opts.status ?? STATUS_BY_CODE[code];
    this.provider = opts.provider;
    this.details = opts.details;
    this.retryable = opts.retryable ?? (code === 'RATE_LIMITED' || code === 'UPSTREAM_TIMEOUT');
  }

  /** Safe to serialize back to the API consumer. */
  get publicMessage(): string {
    return this.message;
  }

  toJSON() {
    return { error: this.publicMessage, code: this.code, provider: this.provider };
  }
}

export class TokenExpiredError extends ProviderError {
  constructor(provider?: string) {
    super('TOKEN_EXPIRED', 'The credential for this account has expired.', { provider });
    this.name = 'TokenExpiredError';
  }
}

export class NotSupportedError extends ProviderError {
  constructor(provider: string, resource: string, operation: string) {
    super('NOT_SUPPORTED', `Provider ${provider} does not support ${operation} on ${resource}.`, { provider });
    this.name = 'NotSupportedError';
  }
}

export class RateLimitError extends ProviderError {
  readonly retryAfterMs?: number;
  constructor(provider: string, retryAfterMs?: number) {
    super('RATE_LIMITED', `Rate limit reached for ${provider}. Please retry shortly.`, { provider, retryable: true });
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class UpstreamError extends ProviderError {
  constructor(provider: string, status: number, details?: unknown) {
    super('UPSTREAM_ERROR', `The ${provider} API returned an error (HTTP ${status}).`, {
      provider,
      details,
      retryable: status >= 500,
    });
    this.name = 'UpstreamError';
  }
}

export function isProviderError(e: unknown): e is ProviderError {
  return e instanceof ProviderError;
}
