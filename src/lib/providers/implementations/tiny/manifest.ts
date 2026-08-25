import type { ProviderManifest } from '@/lib/providers/core/types';

export const tinyManifest: ProviderManifest = {
  slug: 'TINY',
  name: 'Tiny (Olist)',
  category: 'ACCOUNTING',
  description: 'Brazilian ERP for retail and e-commerce operations.',
  logo: '/logos/tiny.svg',
  docsUrl: 'https://tiny.com.br/api-docs',
  baseUrl: 'https://api.tiny.com.br/public-api/v3',
  auth: {
    type: 'OAUTH2',
    authorizationUrl: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
    tokenUrl: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
    scopes: ['openid'],
    tokenEndpointAuth: 'body',
  },
  rateLimit: { requestsPerSecond: 2, burst: 2 },
  // No unified mappers yet; passthrough already makes the connection useful.
  capabilities: {},
  passthrough: true,
  enabled: false,
};
