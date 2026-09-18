import { methodFor } from '@/lib/providers/core/operations';
import type { Operation, ProviderManifest, ResourceName } from '@/lib/providers/core/types';

/**
 * Turns a connected account's capability matrix into MCP tools.
 *
 * Nothing here is written per provider. A provider that gains `deals.create`
 * gains a `create_deal` tool the next time a client lists them, and one that
 * never had `products` never shows a product tool at all. That is the same
 * promise the unified API makes, with the model as the caller.
 */

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Hints for the client, not enforcement. The API is still the authority. */
  annotations?: Record<string, unknown>;
}

/** What a tool name resolves to: a provider method and how to call it. */
export interface ToolBinding {
  kind: 'resource' | 'passthrough';
  method: string;
  resource?: ResourceName;
  operation?: Operation;
}

const SINGULAR: Record<ResourceName, string> = {
  customers: 'customer',
  products: 'product',
  categories: 'category',
  brands: 'brand',
  units: 'unit',
  sales: 'sale',
  sellers: 'seller',
  contacts: 'contact',
  companies: 'company',
  deals: 'deal',
  pipelines: 'pipeline',
};

const VERB: Record<Operation, string> = {
  list: 'list',
  get: 'get',
  search: 'search',
  create: 'create',
  upsert: 'upsert',
  update: 'update',
  delete: 'delete',
  bulkDelete: 'bulk_delete',
  bulkActivate: 'bulk_activate',
  bulkDeactivate: 'bulk_deactivate',
  pdf: 'get_pdf_for',
};

export function toolName(resource: ResourceName, operation: Operation): string {
  // A search returns however many it finds, so it reads as plural like a list.
  const many = operation === 'list' || operation === 'search' || operation.startsWith('bulk');
  const noun = many ? resource : SINGULAR[resource];
  return `${VERB[operation]}_${noun}`;
}

const LIST_SCHEMA = {
  type: 'object',
  properties: {
    cursor: { type: 'string', description: 'Cursor from a previous call. Omit for the first page.' },
    limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Page size, at most 200.' },
    search: { type: 'string', description: 'Free-text search, where the provider supports it.' },
  },
  additionalProperties: false,
};

const MATCH_PROPERTIES = {
  field: {
    type: 'string',
    description: "The field to match on, for example 'email'. The provider decides which fields it accepts.",
  },
  value: { type: 'string', description: 'The value to match.' },
};

const MATCH_SCHEMA = {
  type: 'object',
  properties: MATCH_PROPERTIES,
  required: ['field', 'value'],
  additionalProperties: false,
};

const ID_SCHEMA = {
  type: 'object',
  properties: { id: { type: 'string', description: "The record's id, as returned by the matching list tool." } },
  required: ['id'],
  additionalProperties: false,
};

const IDS_SCHEMA = {
  type: 'object',
  properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1 } },
  required: ['ids'],
  additionalProperties: false,
};

function writeSchema(resource: ResourceName, withId: boolean) {
  const properties: Record<string, unknown> = {
    data: {
      type: 'object',
      description: `Unified ${resource} fields. Only the fields the provider accepts are written; the rest are ignored.`,
      additionalProperties: true,
    },
  };
  if (withId) properties.id = { type: 'string', description: 'The record to change.' };

  return {
    type: 'object',
    properties,
    required: withId ? ['id', 'data'] : ['data'],
    additionalProperties: false,
  };
}

function schemaFor(resource: ResourceName, operation: Operation): Record<string, unknown> {
  switch (operation) {
    case 'list':
      return LIST_SCHEMA;
    case 'search':
      return MATCH_SCHEMA;
    case 'create':
      return writeSchema(resource, false);
    case 'upsert':
      return {
        type: 'object',
        properties: {
          ...MATCH_PROPERTIES,
          data: {
            type: 'object',
            description: `Unified ${resource} fields to write, whether the record is created or updated.`,
            additionalProperties: true,
          },
        },
        required: ['field', 'value', 'data'],
        additionalProperties: false,
      };
    case 'update':
      return writeSchema(resource, true);
    case 'bulkDelete':
    case 'bulkActivate':
    case 'bulkDeactivate':
      return IDS_SCHEMA;
    default:
      return ID_SCHEMA;
  }
}

function describe(manifest: ProviderManifest, resource: ResourceName, operation: Operation): string {
  const noun = SINGULAR[resource];
  const where = `in ${manifest.name}`;

  switch (operation) {
    case 'list':
      return `List ${resource} ${where}. Returns one page plus a cursor; call again with the cursor for the next page.`;
    case 'get':
      return `Fetch one ${noun} ${where} by id.`;
    case 'search':
      return (
        `Find ${resource} ${where} by a field other than the id, such as an email. ` +
        'Returns every match, which may be none or several.'
      );
    case 'create':
      return `Create a ${noun} ${where}.`;
    case 'upsert':
      return (
        `Create a ${noun} ${where}, or update the existing one if the match finds it. ` +
        'Use this instead of create when you are not sure whether the record is already there. ' +
        'A match that finds several records fails rather than picking one.'
      );
    case 'update':
      return `Update an existing ${noun} ${where}. Only the fields you send are changed.`;
    case 'delete':
      return `Delete a ${noun} ${where}. This cannot be undone.`;
    case 'pdf':
      return `Get the PDF document for a ${noun} ${where}.`;
    case 'bulkDelete':
      return `Delete several ${resource} ${where} in one call. This cannot be undone.`;
    case 'bulkActivate':
      return `Activate several ${resource} ${where} in one call.`;
    case 'bulkDeactivate':
      return `Deactivate several ${resource} ${where} in one call.`;
  }
}

const DESTRUCTIVE: Operation[] = ['delete', 'bulkDelete'];
const READ_ONLY: Operation[] = ['list', 'get', 'search', 'pdf'];

/**
 * The tools a connected account exposes, derived from its manifest.
 *
 * The prefix is empty when the connection is the whole scope, and names the
 * connection when several share one server. It is part of the name rather than
 * an argument so that every tool offered is a tool that works: two providers
 * have different resources, and one `connection` parameter would let a model
 * ask Conta Azul for a deal.
 */
export function toolsFor(manifest: ProviderManifest, prefix = ''): McpTool[] {
  const tools: McpTool[] = [];

  for (const [resource, operations] of Object.entries(manifest.capabilities)) {
    for (const operation of (operations ?? []) as Operation[]) {
      // A capability with no method behind it would be a tool that always
      // fails, so it is left out rather than advertised.
      if (!methodFor(resource as ResourceName, operation)) continue;

      tools.push({
        name: `${prefix}${toolName(resource as ResourceName, operation)}`,
        title: `${operation[0].toUpperCase() + operation.slice(1)} ${resource}`,
        description: describe(manifest, resource as ResourceName, operation),
        inputSchema: schemaFor(resource as ResourceName, operation),
        annotations: {
          readOnlyHint: READ_ONLY.includes(operation),
          destructiveHint: DESTRUCTIVE.includes(operation),
        },
      });
    }
  }

  if (manifest.passthrough) {
    tools.push({
      name: `${prefix}passthrough`,
      title: 'Raw provider request',
      description:
        `Call ${manifest.name}'s own API directly, for anything the unified tools do not cover. ` +
        `The path is appended to ${manifest.baseUrl} and the raw provider response comes back unchanged. ` +
        `Prefer the unified tools: their shape is stable across providers, this one's is not.`,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: "Provider path, starting with /. For example '/contacts'." },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
          query: { type: 'object', additionalProperties: true, description: 'Query string parameters.' },
          body: { type: 'object', additionalProperties: true, description: 'JSON body, for writes.' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
  }

  return tools.sort((a, b) => a.name.localeCompare(b.name));
}


function stringifyQuery(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const query: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined || entry === null) continue;
    query[key] = typeof entry === 'object' ? JSON.stringify(entry) : String(entry);
  }
  return query;
}

/** Resolves a tool name back to the provider method it calls. */
export function bindingFor(manifest: ProviderManifest, fullName: string, prefix = ''): ToolBinding | null {
  if (prefix && !fullName.startsWith(prefix)) return null;
  const name = prefix ? fullName.slice(prefix.length) : fullName;

  if (name === 'passthrough') {
    return manifest.passthrough ? { kind: 'passthrough', method: 'passthrough' } : null;
  }

  for (const [resource, operations] of Object.entries(manifest.capabilities)) {
    for (const operation of (operations ?? []) as Operation[]) {
      if (toolName(resource as ResourceName, operation) !== name) continue;

      const method = methodFor(resource as ResourceName, operation);
      // Declared but not implemented: refuse by name rather than call undefined.
      if (!method) return null;
      return { kind: 'resource', method, resource: resource as ResourceName, operation };
    }
  }

  return null;
}

/**
 * Orders the arguments the way the provider method takes them.
 *
 * Provider methods take (ctx, ...args), and the shape of `...args` follows the
 * operation rather than the resource, which is what lets this stay generic.
 */
export function callArgs(binding: ToolBinding, args: Record<string, unknown>): unknown[] {
  if (binding.kind === 'passthrough') {
    return [
      {
        method: (args.method as string) ?? 'GET',
        path: args.path,
        // The provider contract takes a flat string map: a model that sends a
        // number for page[size] should not turn into "[object Object]".
        query: stringifyQuery(args.query),
        body: args.body,
      },
    ];
  }

  switch (binding.operation) {
    case 'search':
      return [{ field: args.field, value: args.value }];
    case 'upsert':
      return [{ field: args.field, value: args.value }, args.data ?? {}];
    case 'list':
      return [
        {
          ...(args.cursor ? { cursor: args.cursor } : {}),
          ...(args.limit ? { limit: args.limit } : {}),
          ...(args.search ? { search: args.search } : {}),
        },
      ];
    case 'create':
      return [args.data ?? {}];
    case 'update':
      return [args.id, args.data ?? {}];
    case 'bulkDelete':
    case 'bulkActivate':
    case 'bulkDeactivate':
      return [args.ids ?? []];
    default:
      return [args.id];
  }
}
