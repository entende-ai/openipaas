import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn(async () => ({ id: 'client-1', name: 'LAD' })) },
  oAuthState: { create: vi.fn(async () => ({})) },
}));

vi.mock('@/lib/prisma', () => ({ default: db }));

import { beginOAuthFlow, exchangeCodeForTokens, slugFromCallbackSegment } from '@/lib/oauth';

const APP = 'https://app.openipaas.com';

describe('OAuth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP);
    vi.stubEnv('RD_STATION_CRM_CLIENT_ID', 'rd-app-id');
    vi.stubEnv('RD_STATION_CRM_CLIENT_SECRET', 'rd-app-secret');
    vi.stubEnv('CONTA_AZUL_CLIENT_ID', 'ca-app-id');
    vi.stubEnv('CONTA_AZUL_CLIENT_SECRET', 'ca-app-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('authorization URL', () => {
    it('builds the RD Station CRM URL without a scope parameter', async () => {
      const { authorizationUrl, state } = await beginOAuthFlow({ providerSlug: 'RD_STATION_CRM', clientId: 'client-1' });
      const url = new URL(authorizationUrl);

      expect(`${url.origin}${url.pathname}`).toBe('https://accounts.rdstation.com/oauth/authorize');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('rd-app-id');
      expect(url.searchParams.get('redirect_uri')).toBe(`${APP}/api/oauth/callback/rd-station-crm`);
      expect(url.searchParams.get('state')).toBe(state);
      // RD documents no scopes; `scope=` with nothing in it is not the same as absent.
      expect(url.searchParams.has('scope')).toBe(false);
    });

    it('still sends scopes for providers that declare them', async () => {
      const { authorizationUrl } = await beginOAuthFlow({ providerSlug: 'CONTA_AZUL', clientId: 'client-1' });

      expect(new URL(authorizationUrl).searchParams.get('scope')).toBe('openid profile aws.cognito.signin.user.admin');
    });

    it('persists the state that the callback will use to find the client', async () => {
      const { state } = await beginOAuthFlow({ providerSlug: 'RD_STATION_CRM', clientId: 'client-1' });

      expect(db.oAuthState.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ state, clientId: 'client-1', provider: 'RD_STATION_CRM' }),
      });
    });

    it('maps the RD callback segment back to the provider', () => {
      expect(slugFromCallbackSegment('rd-station-crm')).toBe('RD_STATION_CRM');
    });
  });

  describe('code exchange', () => {
    it('sends exactly what the RD Station CRM token endpoint documents', async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 7200 }),
        text: async () => '',
      }));
      vi.stubGlobal('fetch', fetchImpl);

      const result = await exchangeCodeForTokens({
        providerSlug: 'RD_STATION_CRM',
        code: 'the-code',
        redirectUri: `${APP}/api/oauth/callback/rd-station-crm`,
      });

      const [url, init] = fetchImpl.mock.calls[0] as unknown as [
        string,
        { headers: Record<string, string>; body: URLSearchParams },
      ];
      const form = Object.fromEntries(new URLSearchParams(init.body));

      expect(url).toBe('https://api.rd.services/oauth2/token');
      expect(form).toEqual({
        grant_type: 'authorization_code',
        code: 'the-code',
        redirect_uri: `${APP}/api/oauth/callback/rd-station-crm`,
        client_id: 'rd-app-id',
        client_secret: 'rd-app-secret',
      });
      expect(init.headers.Authorization).toBeUndefined();
      expect(result).toMatchObject({ accessToken: 'at-1', refreshToken: 'rt-1' });
      expect(result.expiresAt).toBeInstanceOf(Date);
    });
  });
});
