import { z } from 'zod';
import {
  UnifiedBrandSchema,
  UnifiedCategorySchema,
  UnifiedCustomerSchema,
  UnifiedProductSchema,
  UnifiedSaleSchema,
  UnifiedSellerSchema,
  UnifiedUnitSchema,
} from './validations/unified-schemas';
import { listManifests } from './providers/core/manifests';
import type { CapabilityMap, Operation, ResourceName } from './providers/core/types';

/**
 * The spec is derived, not hand-written.
 *
 * The previous version drifted from the code (it documented personType as
 * ["F","J"] while the API returns NATURAL/LEGAL/...). Generating from the same
 * Zod schemas the mappers validate against makes that class of drift impossible.
 */

function schemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function pageOf(ref: string) {
  return {
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } },
      hasMore: { type: 'boolean', description: 'Whether another page is available.' },
      nextCursor: {
        type: ['string', 'null'],
        description: 'Opaque cursor for the next page. Pass it back as ?cursor=',
      },
      totalItems: {
        type: 'integer',
        description: 'Absent for providers whose API cannot report a total.',
      },
    },
    required: ['items', 'hasMore', 'nextCursor'],
  };
}

const ERROR_SCHEMA = {
  type: 'object',
  properties: {
    error: { type: 'string', description: 'Human-readable message, safe to surface.' },
    code: {
      type: 'string',
      enum: [
        'UNAUTHORIZED', 'INVALID_REQUEST', 'NOT_FOUND', 'NOT_SUPPORTED',
        'RATE_LIMITED', 'TOKEN_EXPIRED', 'UPSTREAM_ERROR', 'UPSTREAM_TIMEOUT',
        'CONFIG_ERROR', 'INTERNAL_ERROR',
      ],
    },
    requestId: { type: 'string', description: 'Echoed in the X-Request-Id header. Quote it in support requests.' },
  },
  required: ['error', 'code'],
};

const COMMON_ERRORS = {
  '401': { description: 'Missing or invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  '501': {
    description: 'The connected provider does not support this operation. Check the capability matrix.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  },
};

const LIST_PARAMS = [
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Cursor from a previous response.' },
  { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200 }, description: 'Page size (max 200).' },
  { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Free-text search, where the provider supports it.' },
];

const ID_PARAM = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

function listOp(tag: string, summary: string, ref: string) {
  return {
    tags: [tag],
    summary,
    parameters: LIST_PARAMS,
    responses: {
      '200': { description: 'A page of records', content: { 'application/json': { schema: pageOf(ref) } } },
      ...COMMON_ERRORS,
    },
  };
}

function getOp(tag: string, summary: string, ref: string) {
  return {
    tags: [tag],
    summary,
    parameters: [ID_PARAM],
    responses: {
      '200': { description: 'The record', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } },
      '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      ...COMMON_ERRORS,
    },
  };
}

function bulkOp(tag: string, summary: string) {
  return {
    tags: [tag],
    summary,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
        },
      },
    },
    responses: {
      '200': {
        description: 'Bulk outcome',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { processedCount: { type: 'integer' }, ignoredCount: { type: 'integer' } },
            },
          },
        },
      },
      ...COMMON_ERRORS,
    },
  };
}

/** Renders the manifest capability matrix into the API description. */
function capabilityTable(): string {
  const resources: ResourceName[] = ['customers', 'products', 'categories', 'brands', 'units', 'sales', 'sellers'];
  const manifests = listManifests();

  const header = `| Resource | ${manifests.map((m) => m.name).join(' | ')} |`;
  const divider = `| --- | ${manifests.map(() => '---').join(' | ')} |`;

  const rows = resources.map((resource) => {
    const cells = manifests.map((m) => {
      const ops = (m.capabilities as CapabilityMap)[resource] as readonly Operation[] | undefined;
      return ops && ops.length > 0 ? ops.join(', ') : '-';
    });
    return `| **${resource}** | ${cells.join(' | ')} |`;
  });

  return [header, divider, ...rows].join('\n');
}

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Open IpaaS, Unified API',
    version: '1.0.0',
    description: [
      'One English-first, strongly-typed API over many business platforms.',
      '',
      '## Authentication',
      'Every request needs two headers:',
      '- `Authorization: Bearer <api_key>`, identifies your account.',
      '- `X-Account-Token: <token>`, selects which connected end-customer account to act on.',
      '',
      '## Pagination',
      'Responses carry `hasMore` and an opaque `nextCursor`. Pass the cursor back as `?cursor=`.',
      '`totalItems` is best-effort: providers with cursor-based APIs cannot report a total.',
      '',
      '## Idempotency',
      'Send `Idempotency-Key` on writes. Retrying with the same key replays the original response;',
      'reusing it with a different body returns 422.',
      '',
      '## Errors',
      'Errors carry a stable `code` and a `requestId` (also in `X-Request-Id`).',
      'A `501 NOT_SUPPORTED` means the connected provider lacks that operation.',
      '',
      '## Capability matrix',
      capabilityTable(),
      '',
      'Anything the unified model does not cover is reachable through `/passthrough`.',
    ].join('\n'),
  },
  servers: [
    { url: '/api/unified/v1', description: 'This deployment' },
    { url: 'http://localhost:3000/api/unified/v1', description: 'Local development' },
  ],
  tags: [
    { name: 'Customers', description: 'People, customers and suppliers.' },
    { name: 'Products', description: 'Catalog and inventory.' },
    { name: 'Sales', description: 'Sales, orders and sellers.' },
    { name: 'Platform', description: 'Catalog and raw provider access.' },
  ],
  security: [{ ApiKeyAuth: [], AccountToken: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'http', scheme: 'bearer', description: 'Your Open IpaaS API key.' },
      AccountToken: { type: 'apiKey', in: 'header', name: 'X-Account-Token', description: 'The connected account to act on.' },
    },
    schemas: {
      Customer: schemaOf(UnifiedCustomerSchema),
      Product: schemaOf(UnifiedProductSchema),
      Category: schemaOf(UnifiedCategorySchema),
      Brand: schemaOf(UnifiedBrandSchema),
      Unit: schemaOf(UnifiedUnitSchema),
      Sale: schemaOf(UnifiedSaleSchema),
      Seller: schemaOf(UnifiedSellerSchema),
      Error: ERROR_SCHEMA,
    },
  },
  paths: {
    '/providers': {
      get: {
        tags: ['Platform'],
        summary: 'List supported integrations and their capabilities',
        security: [],
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['ACCOUNTING', 'ECOMMERCE', 'CRM', 'PAYMENTS', 'FISCAL', 'HRIS'] } },
          { name: 'enabled', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { '200': { description: 'The integration catalog' } },
      },
    },
    '/customers': {
      get: listOp('Customers', 'List customers', 'Customer'),
      post: {
        tags: ['Customers'],
        summary: 'Create a customer',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
        responses: { '201': { description: 'Created' }, ...COMMON_ERRORS },
      },
    },
    '/customers/{id}': {
      get: getOp('Customers', 'Fetch a customer', 'Customer'),
      patch: {
        tags: ['Customers'],
        summary: 'Update a customer',
        parameters: [ID_PARAM],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
        responses: { '200': { description: 'Updated' }, ...COMMON_ERRORS },
      },
    },
    '/customers/bulk/activate': { post: bulkOp('Customers', 'Activate customers in bulk') },
    '/customers/bulk/deactivate': { post: bulkOp('Customers', 'Deactivate customers in bulk') },
    '/customers/bulk/delete': { post: bulkOp('Customers', 'Delete customers in bulk') },
    '/products': {
      get: listOp('Products', 'List products', 'Product'),
      post: {
        tags: ['Products'],
        summary: 'Create a product',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
        responses: { '201': { description: 'Created' }, ...COMMON_ERRORS },
      },
    },
    '/products/{id}': {
      get: getOp('Products', 'Fetch a product', 'Product'),
      patch: {
        tags: ['Products'],
        summary: 'Update a product',
        parameters: [ID_PARAM],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
        responses: { '200': { description: 'Updated' }, ...COMMON_ERRORS },
      },
      delete: {
        tags: ['Products'],
        summary: 'Delete a product',
        parameters: [ID_PARAM],
        responses: { '200': { description: 'Deleted' }, ...COMMON_ERRORS },
      },
    },
    '/products/categories': { get: listOp('Products', 'List product categories', 'Category') },
    '/products/brands': { get: listOp('Products', 'List product brands', 'Brand') },
    '/products/units': { get: listOp('Products', 'List units of measure', 'Unit') },
    '/sales': { get: listOp('Sales', 'List sales', 'Sale') },
    '/sales/{id}': { get: getOp('Sales', 'Fetch a sale with items and installments', 'Sale') },
    '/sales/{id}/pdf': {
      get: {
        tags: ['Sales'],
        summary: 'Download the sale PDF',
        parameters: [ID_PARAM],
        responses: {
          '200': { description: 'The PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
          ...COMMON_ERRORS,
        },
      },
    },
    '/sales/sellers': { get: listOp('Sales', 'List sellers', 'Seller') },
    '/sales/bulk': { post: bulkOp('Sales', 'Delete sales in bulk') },
    '/passthrough/{path}': {
      get: {
        tags: ['Platform'],
        summary: 'Call the provider API directly',
        description:
          'Forwards the request to the connected provider with credentials, throttling and retries applied. ' +
          'Use it for fields or endpoints the unified model does not cover yet.',
        parameters: [{ name: 'path', in: 'path', required: true, schema: { type: 'string' }, description: 'Provider-relative path.' }],
        responses: { '200': { description: 'The raw provider response' }, ...COMMON_ERRORS },
      },
    },
  },
};
