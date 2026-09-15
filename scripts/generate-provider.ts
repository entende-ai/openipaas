import * as fs from 'fs';
import * as path from 'path';

/**
 * Scaffolds a new integration.
 *
 * Emits a complete provider folder (manifest, provider class, mappers stub and
 * tests) plus the single registry line to add. The generated provider passes
 * the contract suite immediately: it declares no capabilities and enables
 * passthrough, so it is honest about what it can do from day one.
 */

const rawName = process.argv[2];

if (!rawName) {
  console.error('❌ Usage: npm run generate-provider <name>   (e.g. bling, nuvemshop)');
  process.exit(1);
}

const dirName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = rawName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
const className = dirName.charAt(0).toUpperCase() + dirName.slice(1);
const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

const providerDir = path.join(process.cwd(), 'src', 'lib', 'providers', 'implementations', dirName);

if (fs.existsSync(providerDir)) {
  console.error(`❌ ${providerDir} already exists.`);
  process.exit(1);
}

const manifest = `import type { ProviderManifest } from '@/lib/providers/core/types';

export const ${dirName}Manifest: ProviderManifest = {
  slug: '${slug}',
  name: '${displayName}',
  category: 'ACCOUNTING', // ACCOUNTING | ECOMMERCE | CRM | PAYMENTS | FISCAL | HRIS
  description: 'TODO: one line describing what ${displayName} does.',
  // A file under public/logos, named by domain: add the domain to
  // scripts/download-logos.js and run it. The contract suite fails if the file
  // is missing, so leave this out until it exists.
  // logo: '/logos/${dirName}.com.png',
  docsUrl: 'https://example.com/docs',
  // No trailing slash: request paths are appended directly.
  baseUrl: 'https://api.${dirName}.com/v1',

  auth: {
    type: 'OAUTH2',
    authorizationUrl: 'https://example.com/oauth/authorize',
    tokenUrl: 'https://example.com/oauth/token',
    scopes: ['read', 'write'],
    tokenEndpointAuth: 'body', // 'basic' if client credentials go in the header
  },

  // Throttle ourselves to whatever the upstream documents.
  rateLimit: { requestsPerSecond: 2, burst: 2 },

  /**
   * Declare an operation only once the matching method exists: the contract
   * suite fails if the two disagree, in either direction.
   */
  capabilities: {},

  passthrough: true,
  // Offered in the connect dialog. Flip to true once connecting an account works
  // end to end; passthrough alone is enough, capabilities can come later.
  enabled: false,
};
`;

const provider = `import { BaseProvider } from '@/lib/providers/core/BaseProvider';
import { readPage, nextPageCursor } from '@/lib/providers/core/pagination';
import type {
  ListParams,
  Page,
  ProviderContext,
  ProviderManifest,
} from '@/lib/providers/core/types';
import type { UnifiedCustomer } from '@/types/unified';

import { ${dirName}Manifest } from './manifest';
// import { map${className}CustomerToUnified } from './mappers/customers';

/**
 * ${displayName} provider.
 *
 * BaseProvider already handles URL building, rate limiting, retry with backoff,
 * refresh-and-replay on 401 and passthrough. Implement mappers and endpoint
 * paths here, and declare each capability in the manifest as it lands.
 */
export class ${className}Provider extends BaseProvider {
  readonly manifest: ProviderManifest = ${dirName}Manifest;

  /* Override only if the provider does not use bearer tokens.
  protected override authHeaders(ctx: ProviderContext): Record<string, string> {
    return { 'X-Api-Key': ctx.accessToken };
  }
  */

  /* Reference implementation: uncomment, adapt, and declare
     customers: ['list'] in the manifest.

  async listCustomers(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedCustomer>> {
    this.assertSupports('customers', 'list');

    const page = readPage(params.cursor);
    const size = Number(params.limit) > 0 ? Number(params.limit) : 50;

    const data = await this.request(ctx, {
      method: 'GET',
      path: '/customers',
      query: { page, per_page: size },
    });

    const raw: any[] = data?.items ?? [];
    return this.page(raw.map(map${className}CustomerToUnified), {
      totalItems: data?.total,
      nextCursor: nextPageCursor(page, raw.length, size, data?.total),
    });
  }
  */
}
`;

const mappers = `import { UnifiedCustomerSchema } from '@/lib/validations/unified-schemas';
import type { UnifiedCustomer } from '@/types/unified';

/**
 * Upstream -> unified. Always finish with a Zod parse: if ${displayName} changes
 * its contract, this is where it must fail, not somewhere downstream.
 */
export function map${className}CustomerToUnified(raw: any): UnifiedCustomer {
  return UnifiedCustomerSchema.parse({
    id: String(raw.id),
    name: raw.name,
    email: raw.email ?? null,
    document: raw.document ?? null,
    personType: 'UNKNOWN',
    isActive: raw.active ?? true,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at ?? null,
    phones: raw.phone ? [raw.phone] : [],
    remoteData: { provider: '${slug}', raw },
  });
}
`;

const test = `import { describe, it, expect } from 'vitest';
import { ${className}Provider } from '@/lib/providers/implementations/${dirName}/provider';
import { makeContext, stubFetch, noSleep } from '../helpers';

// The shared contract suite already checks the manifest and capability wiring.
// Add ${displayName}-specific behaviour here: URLs, pagination, quirks.

const ctx = makeContext({ provider: '${slug}' });

describe('${className}Provider', () => {
  it('is constructible', () => {
    expect(new ${className}Provider({}).manifest.slug).toBe('${slug}');
  });

  it.todo('lists customers and maps them to the unified shape');
});
`;

fs.mkdirSync(path.join(providerDir, 'mappers'), { recursive: true });
fs.writeFileSync(path.join(providerDir, 'manifest.ts'), manifest);
fs.writeFileSync(path.join(providerDir, 'provider.ts'), provider);
fs.writeFileSync(path.join(providerDir, 'mappers', 'customers.ts'), mappers);

const testDir = path.join(process.cwd(), 'src', 'tests', 'providers');
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(path.join(testDir, `${dirName}.test.ts`), test);

console.log(`✅ Created src/lib/providers/implementations/${dirName}/`);
console.log(`   manifest.ts, provider.ts, mappers/customers.ts`);
console.log(`✅ Created src/tests/providers/${dirName}.test.ts`);
console.log('');
console.log('👉 One step left, register it in src/lib/providers/core/registry.ts:');
console.log('');
console.log(`   import { ${dirName}Manifest } from '../implementations/${dirName}/manifest';`);
console.log(`   import { ${className}Provider } from '../implementations/${dirName}/provider';`);
console.log('');
console.log('   export const PROVIDERS = {');
console.log('     ...');
console.log(`     [${dirName}Manifest.slug]: { manifest: ${dirName}Manifest, create: (deps) => new ${className}Provider(deps) },`);
console.log('   }');
console.log('');
console.log('Then run: npx vitest run src/tests/providers/contract.test.ts');
