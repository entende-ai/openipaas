import { ProviderError } from './errors';

/**
 * Cursors are opaque base64url blobs so clients cannot depend on a provider's
 * internal paging scheme. Page-number APIs and cursor APIs both encode here,
 * which is what lets one unified contract cover both.
 */
export function encodeCursor(state: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

export function decodeCursor(cursor?: string | null): Record<string, any> | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* fall through */
  }
  throw new ProviderError('INVALID_REQUEST', 'The provided cursor is malformed.');
}

/** Current 1-based page for page-numbered upstreams. */
export function readPage(cursor?: string | null): number {
  const state = decodeCursor(cursor);
  const page = state?.page;
  return typeof page === 'number' && page > 0 ? page : 1;
}

/** Cursor for the next page, or null when the current page is the last one. */
export function nextPageCursor(currentPage: number, received: number, pageSize: number, totalItems?: number): string | null {
  if (received < pageSize) return null;
  if (typeof totalItems === 'number' && currentPage * pageSize >= totalItems) return null;
  return encodeCursor({ page: currentPage + 1 });
}
