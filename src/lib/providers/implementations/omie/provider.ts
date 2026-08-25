import { BaseProvider } from '@/lib/providers/core/BaseProvider';
import { readPage, nextPageCursor } from '@/lib/providers/core/pagination';
import { ProviderError } from '@/lib/providers/core/errors';
import type {
  CustomerModule,
  ListParams,
  Page,
  ProviderContext,
  ProviderManifest,
} from '@/lib/providers/core/types';
import type { UnifiedCustomer } from '@/types/unified';

import { omieManifest } from './manifest';
import { mapOmieCustomerToUnified } from './mappers/customers';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Omie is JSON-RPC style: every call is a POST whose body carries the method
 * name and the app key/secret pair. There is no bearer token and no refresh, so
 * this provider overrides the auth headers away and signs each body instead.
 */
export class OmieProvider extends BaseProvider implements CustomerModule {
  readonly manifest: ProviderManifest = omieManifest;

  /** Omie authenticates in the body, not in a header. */
  protected override authHeaders(): Record<string, string> {
    return {};
  }

  private appCredentials(ctx: ProviderContext): { appKey: string; appSecret: string } {
    const appKey = ctx.secrets.appKey ?? ctx.accessToken;
    const appSecret = ctx.secrets.appSecret ?? ctx.refreshToken ?? '';

    if (!appKey || !appSecret) {
      throw new ProviderError('CONFIG_ERROR', 'This Omie account is missing its app key/secret pair.', {
        provider: this.manifest.slug,
      });
    }
    return { appKey, appSecret };
  }

  private async call(ctx: ProviderContext, path: string, call: string, param: unknown[]): Promise<any> {
    const { appKey, appSecret } = this.appCredentials(ctx);

    const data = await this.request(ctx, {
      method: 'POST',
      path,
      body: { call, app_key: appKey, app_secret: appSecret, param },
    });

    // Omie reports failures inside a 200 OK body.
    if (data?.faultString) {
      throw new ProviderError('UPSTREAM_ERROR', `Omie rejected the "${call}" call.`, {
        provider: this.manifest.slug,
        details: `${data.faultString} (${data.faultCode})`,
      });
    }
    return data;
  }

  async listCustomers(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedCustomer>> {
    this.assertSupports('customers', 'list');

    const page = readPage(params.cursor);
    const size = Number(params.limit) > 0 ? Number(params.limit) : DEFAULT_PAGE_SIZE;

    const data = await this.call(ctx, '/geral/clientes/', 'ListarClientes', [
      { pagina: page, registros_por_pagina: size },
    ]);

    const raw: any[] = data?.clientes_cadastro ?? [];
    const totalItems = data?.total_de_registros ?? raw.length;

    return this.page(raw.map(mapOmieCustomerToUnified), {
      totalItems,
      nextCursor: nextPageCursor(page, raw.length, size, totalItems),
    });
  }
}
