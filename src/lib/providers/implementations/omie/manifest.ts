import type { ProviderManifest } from '@/lib/providers/core/types';

export const omieManifest: ProviderManifest = {
  slug: 'OMIE',
  name: 'Omie',
  category: 'ACCOUNTING',
  description: 'Brazilian cloud ERP with a JSON-RPC style API.',
  logo: '/logos/omie.svg',
  docsUrl: 'https://developer.omie.com.br',
  baseUrl: 'https://app.omie.com.br/api/v1',
  auth: {
    // Omie has no OAuth flow: the customer pastes an app key/secret pair.
    type: 'API_KEY',
    fields: [
      { key: 'appKey', label: 'App Key', required: true, secret: false },
      { key: 'appSecret', label: 'App Secret', required: true, secret: true },
    ],
  },
  rateLimit: { requestsPerSecond: 4, burst: 4 },
  capabilities: {
    customers: ['list'],
  },
  passthrough: true,
  enabled: true,
};
