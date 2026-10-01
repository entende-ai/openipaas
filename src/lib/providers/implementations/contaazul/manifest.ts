import type { ProviderManifest } from '@/lib/providers/core/types';

export const contaAzulManifest: ProviderManifest = {
  slug: 'CONTA_AZUL',
  name: 'Conta Azul',
  category: 'ACCOUNTING',
  description: 'Brazilian cloud ERP for small and medium businesses.',
  logo: '/logos/contaazul.com.png',
  docsUrl: 'https://developers.contaazul.com',
  baseUrl: 'https://api-v2.contaazul.com/v1',
  auth: {
    type: 'OAUTH2',
    authorizationUrl: 'https://auth.contaazul.com/login',
    tokenUrl: 'https://auth.contaazul.com/oauth2/token',
    scopes: ['openid', 'profile', 'aws.cognito.signin.user.admin'],
    tokenEndpointAuth: 'basic',
  },
  rateLimit: { requestsPerSecond: 5, burst: 10 },
  capabilities: {
    customers: ['list', 'get', 'update', 'bulkActivate', 'bulkDeactivate', 'bulkDelete'],
    products: ['list', 'get', 'create', 'update', 'delete'],
    categories: ['list'],
    brands: ['list'],
    units: ['list'],
    sales: ['list', 'get', 'pdf', 'bulkDelete'],
    sellers: ['list'],
  },
  // Sellers arrive whole in one response, so there is no scan to get wrong.
  // The paged resources are deliberately absent: Conta Azul documents no sort
  // parameter and no account has been measured, so claiming a complete scan
  // here would be a promise nobody checked. See issue on measuring them.
  stableList: ['sellers'],
  passthrough: true,
  enabled: true,
};
