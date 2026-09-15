import type { ProviderManifest } from '@/lib/providers/core/types';

/**
 * RD Station CRM, API v2.
 *
 * The CRM product only. RD Station issues separate credentials per product, so
 * Marketing and Conversas will be providers of their own.
 *
 * From https://developers.rdstation.com/reference/crm-v2-authentication:
 *   - the authorization code is valid for 5 minutes;
 *   - the access token lasts 2 hours;
 *   - the refresh token rotates on every use, which is why token-refresh.ts
 *     serializes renewals per credential;
 *   - client credentials go in the form body;
 *   - no scopes and no PKCE are documented.
 */
export const rdStationCrmManifest: ProviderManifest = {
  slug: 'RD_STATION_CRM',
  name: 'RD Station CRM',
  category: 'CRM',
  description: 'Brazilian sales CRM: contacts, companies, deals and pipelines.',
  docsUrl: 'https://developers.rdstation.com/reference/crm-v2-introduction',
  // No trailing slash: request paths are appended directly.
  baseUrl: 'https://api.rd.services/crm/v2',

  auth: {
    type: 'OAUTH2',
    authorizationUrl: 'https://accounts.rdstation.com/oauth/authorize',
    tokenUrl: 'https://api.rd.services/oauth2/token',
    scopes: [],
    tokenEndpointAuth: 'body',
  },

  // 120 requests per minute per account on every plan; a 429 carries Retry-After.
  rateLimit: { requestsPerSecond: 2, burst: 2 },

  // Unified CRM resources arrive with the CRM domain; passthrough makes a
  // connected account useful until then.
  capabilities: {},

  passthrough: true,

  // Stays off until the OAuth flow has run once against a real RD app. The docs
  // do not mention the `state` parameter, and without it the callback cannot
  // tell which client the account belongs to.
  enabled: false,
};
