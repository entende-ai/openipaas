/**
 * What a key is allowed to do.
 *
 * A key is the client's credential, and until now every key reached everything
 * that client had. That is the right default for a backend the operator wrote,
 * and the wrong one for a key handed to an agent, to a partner, or to the part
 * of a product that only ever reads.
 *
 * A scope is `action:resource`: `read:contacts`, `write:*`. The resource is the
 * one the URL names, not the provider, because the point is to limit what the
 * holder can do, whichever system is behind it.
 */

export type ScopeAction = 'read' | 'write';

/** Every resource a scope can name. `*` in a scope stands for all of them. */
export const SCOPE_RESOURCES = [
  'customers',
  'products',
  'categories',
  'brands',
  'units',
  'sales',
  'sellers',
  'contacts',
  'companies',
  'deals',
  'pipelines',
  'passthrough',
  'connections',
] as const;

export type ScopeResource = (typeof SCOPE_RESOURCES)[number];

export const FULL_ACCESS: string[] = ['read:*', 'write:*'];
export const READ_ONLY: string[] = ['read:*'];

const ACTIONS: ScopeAction[] = ['read', 'write'];

/** A scope string that is not one of ours is ignored rather than trusted. */
export function isValidScope(scope: string): boolean {
  const [action, resource] = scope.split(':');
  if (!ACTIONS.includes(action as ScopeAction)) return false;
  return resource === '*' || SCOPE_RESOURCES.includes(resource as ScopeResource);
}

export function parseScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const clean = raw.map((entry) => String(entry).trim().toLowerCase()).filter(isValidScope);
  return [...new Set(clean)];
}

/**
 * Which resource a path belongs to.
 *
 * Nested paths are named explicitly rather than folded into their parent:
 * `/products/categories` is the categories resource, the same one the
 * `list_categories` tool serves, so a scope means the same thing through the
 * API and through an agent.
 */
export function resourceForPath(pathname: string): ScopeResource | null {
  const parts = pathname.replace(/^\/api\/unified\/v1/, '').split('/').filter(Boolean);
  const [head, next] = parts;

  if (!head) return null;
  if (head === 'passthrough') return 'passthrough';
  if (head === 'connections') return 'connections';
  if (head === 'products' && (next === 'categories' || next === 'brands' || next === 'units')) return next;
  if (head === 'sales' && next === 'sellers') return 'sellers';

  return SCOPE_RESOURCES.includes(head as ScopeResource) ? (head as ScopeResource) : null;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Reading or writing, from the HTTP method.
 *
 * Bulk endpoints are POSTs that delete or deactivate, so method is the honest
 * signal: `POST /customers/bulk/delete` is a write however it is spelled. The
 * one place this is not enough is passthrough, where a GET reads and a POST
 * writes, and the method is exactly right again.
 */
export function actionForMethod(method: string): ScopeAction {
  return WRITE_METHODS.has(method.toUpperCase()) ? 'write' : 'read';
}

/**
 * Whether these scopes allow an action on a resource.
 *
 * An empty list means full access. Keys issued before scopes existed have no
 * scopes stored, and a key that suddenly refuses every call would be an outage
 * dressed up as a security feature. New keys always carry scopes, so the empty
 * case shrinks to nothing as keys rotate.
 */
export function allows(scopes: string[], action: ScopeAction, resource: ScopeResource | null): boolean {
  if (scopes.length === 0) return true;
  if (!resource) return false;

  return scopes.includes(`${action}:*`) || scopes.includes(`${action}:${resource}`);
}

/** Reads back as a sentence, for the dashboard and for an error message. */
export function describeScopes(scopes: string[]): string {
  if (scopes.length === 0) return 'Everything this client has';

  const byAction = ACTIONS.map((action) => {
    const resources = scopes
      .filter((scope) => scope.startsWith(`${action}:`))
      .map((scope) => scope.slice(action.length + 1));

    if (resources.length === 0) return null;
    if (resources.includes('*')) return `${action} everything`;
    return `${action} ${resources.sort().join(', ')}`;
  }).filter(Boolean);

  return byAction.length > 0 ? (byAction.join('; ') as string) : 'Nothing';
}
