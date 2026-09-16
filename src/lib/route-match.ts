import { ProviderError } from './providers/core/errors';
import type { RecordMatch } from './providers/core/types';

/**
 * Reading a natural-key match off a request.
 *
 * Shared by the search and upsert routes so the two cannot disagree about what
 * a match looks like, and so the error a caller gets for a missing field is the
 * same sentence in both.
 */

const MAX_VALUE_LENGTH = 512;

function validate(field: unknown, value: unknown): RecordMatch {
  const trimmedField = typeof field === 'string' ? field.trim() : '';
  const trimmedValue = typeof value === 'string' ? value.trim() : '';

  if (!trimmedField || !trimmedValue) {
    throw new ProviderError(
      'INVALID_REQUEST',
      'A match needs a field and a value, for example field=email and value=someone@example.com.'
    );
  }

  // A value this long is a mistake or an attempt to build a query, not an email.
  if (trimmedValue.length > MAX_VALUE_LENGTH) {
    throw new ProviderError('INVALID_REQUEST', `A match value cannot be longer than ${MAX_VALUE_LENGTH} characters.`);
  }

  return { field: trimmedField, value: trimmedValue };
}

/** From the query string, for a search. */
export function readMatch(params: URLSearchParams): RecordMatch {
  return validate(params.get('field'), params.get('value'));
}

/**
 * From the body, for an upsert.
 *
 * Accepts the match flat (`{ field, value, data }`) or nested
 * (`{ match: { field, value }, data }`), because both read naturally and
 * refusing one of them would be arbitrary.
 */
export function readUpsertBody(body: unknown): { match: RecordMatch; data: Record<string, unknown> } {
  const payload = (body ?? {}) as Record<string, unknown>;
  const nested = (payload.match ?? {}) as Record<string, unknown>;

  const match = validate(payload.field ?? nested.field, payload.value ?? nested.value);
  const data = (payload.data ?? {}) as Record<string, unknown>;

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ProviderError('INVALID_REQUEST', 'The data field must be an object of unified fields.');
  }

  return { match, data };
}
