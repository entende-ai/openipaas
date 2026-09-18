import { z } from 'zod';
import {
  UnifiedBrandSchema,
  UnifiedCompanySchema,
  UnifiedContactSchema,
  UnifiedDealSchema,
  UnifiedPipelineSchema,
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
        'CONFIG_ERROR', 'INTERNAL_ERROR', 'AMBIGUOUS_CONNECTION',
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

const MATCH_PARAMS = [
  {
    name: 'field',
    in: 'query',
    required: true,
    schema: { type: 'string' },
    description: "Field to match on, for example 'email'.",
  },
  { name: 'value', in: 'query', required: true, schema: { type: 'string' }, description: 'Value to match.' },
];

/** What an upsert answers with: the record, plus whether it was new. */
function upsertOf(ref: string) {
  return {
    type: 'object',
    properties: {
      record: { $ref: `#/components/schemas/${ref}` },
      created: { type: 'boolean', description: 'True when the record did not exist and was created.' },
    },
    required: ['record', 'created'],
  };
}

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
  const resources: ResourceName[] = [
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
  ];
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
      'New here? The [integration guide](https://github.com/entende-ai/openipaas/blob/master/docs/INTEGRATION.md)',
      'walks through client, key, connection and first call. This page is the field by field reference.',
      '',
      '## Authentication',
      'The API key is the client: every key belongs to exactly one, and reaches the connections of that client and',
      'nothing else. Each request then picks one of those connections, by service or by connection token:',
      '- `Authorization: Bearer <api_key>`, always.',
      '- `X-Provider: <SERVICE>`, for example `RD_STATION_CRM`. Readable, and enough while the client has one',
      '  account on that service. The service names are listed by `GET /providers`.',
      '- `X-Account-Token: <connection token>`, pins one exact connection. Needed when a client has two accounts',
      '  on the same service, where `X-Provider` answers `409 AMBIGUOUS_CONNECTION`. Wins when both are sent.',
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
    { name: 'CRM', description: 'Contacts, companies, deals and the funnel they move through.' },
    { name: 'Platform', description: 'Catalog and raw provider access.' },
  ],
  // Either way of picking the connection satisfies a request; the key is always required.
  security: [
    { ApiKeyAuth: [], Provider: [] },
    { ApiKeyAuth: [], AccountToken: [] },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'http', scheme: 'bearer', description: 'Your Open IpaaS API key.' },
      Provider: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Provider',
        description: 'The service to act on, for example RD_STATION_CRM. Resolves to the one connection the client has on it.',
      },
      AccountToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Account-Token',
        description: 'The connection token: one exact connection. Needed when a client has two on the same service.',
      },
    },
    schemas: {
      Customer: schemaOf(UnifiedCustomerSchema),
      Product: schemaOf(UnifiedProductSchema),
      Category: schemaOf(UnifiedCategorySchema),
      Brand: schemaOf(UnifiedBrandSchema),
      Unit: schemaOf(UnifiedUnitSchema),
      Sale: schemaOf(UnifiedSaleSchema),
      Seller: schemaOf(UnifiedSellerSchema),
      Contact: schemaOf(UnifiedContactSchema),
      ContactUpsert: {
        type: 'object',
        description: 'The match plus the fields to write. `match: { field, value }` is accepted too.',
        properties: {
          field: { type: 'string', description: "Field to match on, for example 'email'." },
          value: { type: 'string', description: 'Value to match.' },
          data: { $ref: '#/components/schemas/Contact' },
        },
        required: ['field', 'value', 'data'],
      },
      Company: schemaOf(UnifiedCompanySchema),
      Deal: schemaOf(UnifiedDealSchema),
      Pipeline: schemaOf(UnifiedPipelineSchema),
      Error: ERROR_SCHEMA,
    },
  },
  paths: {
    '/contacts': {
      get: listOp('CRM', 'List contacts', 'Contact'),
      post: {
        tags: ['CRM'],
        summary: 'Create a contact',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Contact' } } } },
        responses: { '201': { description: 'Created' }, ...COMMON_ERRORS },
      },
    },
    '/contacts/{id}': {
      get: getOp('CRM', 'Fetch a contact', 'Contact'),
    },
    '/contacts/search': {
      get: {
        tags: ['CRM'],
        summary: 'Find contacts by a natural key',
        description:
          'Matches on a field the provider can filter by, such as an email address. ' +
          'Which fields are accepted is up to the provider, and an unsupported one is refused with INVALID_REQUEST.',
        parameters: MATCH_PARAMS,
        responses: {
          '200': { description: 'The matches, which may be none', content: { 'application/json': { schema: pageOf('Contact') } } },
          ...COMMON_ERRORS,
        },
      },
    },
    '/contacts/upsert': {
      post: {
        tags: ['CRM'],
        summary: 'Create a contact, or update the one the match finds',
        description:
          'Answers 201 when it created the record and 200 when it updated one, and repeats that in `created`. ' +
          'A match that finds more than one record is refused rather than resolved by guessing.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ContactUpsert' } } },
        },
        responses: {
          '200': { description: 'Updated', content: { 'application/json': { schema: upsertOf('Contact') } } },
          '201': { description: 'Created', content: { 'application/json': { schema: upsertOf('Contact') } } },
          '422': {
            description: 'The match found more than one record',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          ...COMMON_ERRORS,
        },
      },
    },
    '/companies': {
      get: listOp('CRM', 'List companies', 'Company'),
      post: {
        tags: ['CRM'],
        summary: 'Create a company',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Company' } } } },
        responses: { '201': { description: 'Created' }, ...COMMON_ERRORS },
      },
    },
    '/companies/{id}': {
      get: getOp('CRM', 'Fetch a company', 'Company'),
    },
    '/deals': {
      get: listOp('CRM', 'List deals', 'Deal'),
      post: {
        tags: ['CRM'],
        summary: 'Create a deal',
        description: 'A deal joins a funnel through `stageId`. Providers derive the pipeline from the stage.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Deal' } } } },
        responses: { '201': { description: 'Created' }, ...COMMON_ERRORS },
      },
    },
    '/deals/{id}': {
      get: getOp('CRM', 'Fetch a deal', 'Deal'),
    },
    '/pipelines': {
      get: {
        tags: ['CRM'],
        summary: 'List pipelines with their stages',
        description: 'Stages arrive inside their pipeline: a stage id only means something against the funnel it belongs to.',
        parameters: LIST_PARAMS,
        responses: {
          '200': { description: 'A page of pipelines', content: { 'application/json': { schema: pageOf('Pipeline') } } },
          ...COMMON_ERRORS,
        },
      },
    },
    '/providers': {
      get: {
        tags: ['Platform'],
        summary: 'List supported integrations and their capabilities',
        security: [],
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['ACCOUNTING', 'ECOMMERCE', 'CRM', 'PAYMENTS', 'FISCAL', 'HRIS'] } },
          {
            name: 'enabled',
            in: 'query',
            description: 'true lists only the integrations an account can be connected to today.',
            schema: { type: 'boolean' },
          },
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
